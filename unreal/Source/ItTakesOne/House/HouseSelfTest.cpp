#include "House/HouseSelfTest.h"

#include "AnimationRuntime.h"
#include "AudioMixerBlueprintLibrary.h"
#include "RHI.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/SkinnedAsset.h"
#include "Engine/GameViewportClient.h"
#include "Engine/TargetPoint.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"
#include "GenericPlatform/GenericPlatformInputDeviceMapper.h"
#include "InputKeyEventArgs.h"
#include "House/DescentRide.h"
#include "House/HouseDetail.h"
#include "House/HouseDirector.h"
#include "House/HouseGameMode.h"
#include "House/HouseReflection.h"
#include "House/NacreTentacle.h"
#include "ItTakesOne.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#if WITH_EDITOR
#include "ShaderCompiler.h"
#endif
#include "Stormworks/MaraCharacter.h"
#include "Stormworks/StormCinema.h"
#include "UnrealClient.h"

AHouseSelfTest::AHouseSelfTest()
{
	PrimaryActorTick.bCanEverTick = true;
}

void AHouseSelfTest::BeginPlay()
{
	Super::BeginPlay();
	OutDir = FPaths::ConvertRelativePathToFull(FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("HouseSelfTest")));
	IFileManager::Get().MakeDirectory(*OutDir, true);
	// Rewriting the whole file per line lost every line after the first in this process (the cause
	// was not found); one writer held open for the run does not.
	ResultsFile.Reset(IFileManager::Get().CreateFileWriter(*FPaths::Combine(OutDir, TEXT("results.txt")), FILEWRITE_AllowRead));
	if (!ResultsFile)
	{
		UE_LOG(LogStormworks, Warning, TEXT("HOUSETEST cannot write %s/results.txt"), *OutDir);
	}
	// The bot plays alone: nobody at the machine can skip or interact for it.
	if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
	{
		Viewport->SetIgnoreInput(true);
	}
	Log(TEXT("House self-test: start"));
	Build();
}

void AHouseSelfTest::Log(const FString& Line)
{
	const FString Stamped = FString::Printf(TEXT("[%6.2f] %s"), Total, *Line);
	UE_LOG(LogStormworks, Display, TEXT("HOUSETEST %s"), *Stamped);
	if (ResultsFile)
	{
		FTCHARToUTF8 Utf8(*(Stamped + LINE_TERMINATOR));
		ResultsFile->Serialize(const_cast<ANSICHAR*>(Utf8.Get()), Utf8.Length());
		ResultsFile->Flush();
	}
}

void AHouseSelfTest::EndPlay(const EEndPlayReason::Type Reason)
{
	ResultsFile.Reset();
	Super::EndPlay(Reason);
}

void AHouseSelfTest::Check(bool bOk, const FString& What)
{
	(bOk ? Passed : Failed)++;
	Log(FString::Printf(TEXT("%s  %s"), bOk ? TEXT("PASS") : TEXT("FAIL"), *What));
}

void AHouseSelfTest::Shot(const FString& Name)
{
	FScreenshotRequest::RequestScreenshot(FPaths::Combine(OutDir, Name + TEXT(".png")), true, false);
	Log(FString::Printf(TEXT("screenshot %s"), *Name));
}

APlayerController* AHouseSelfTest::PC() const
{
	return GetWorld()->GetFirstPlayerController();
}

AMaraCharacter* AHouseSelfTest::Mara() const
{
	return PC() ? Cast<AMaraCharacter>(PC()->GetPawn()) : nullptr;
}

FVector AHouseSelfTest::WP(const TCHAR* Tag) const
{
	for (TActorIterator<ATargetPoint> It(GetWorld()); It; ++It)
	{
		if (It->ActorHasTag(Tag))
		{
			return It->GetActorLocation();
		}
	}
	return FVector::ZeroVector;
}

bool AHouseSelfTest::MoveTo(const FVector& Where, float Radius)
{
	AMaraCharacter* M = Mara();
	if (!M)
	{
		return false;
	}
	FVector D = Where - M->GetActorLocation();
	if (!M->GetCharacterMovement()->IsSwimming())
	{
		D.Z = 0.f;
	}
	if (D.Size() <= Radius)
	{
		HoldW(false);
		return true;
	}
	// The W key, through the same mappings as a player's: forward is where the camera faces.
	PC()->SetControlRotation(FRotator(M->GetCharacterMovement()->IsSwimming() ? D.Rotation().Pitch : -12.f, D.Rotation().Yaw, 0.f));
	HoldW(true);
	return false;
}

void AHouseSelfTest::Key(const FKey& Which, bool bDown)
{
	const UGameViewportClient* Viewport = GetWorld()->GetGameViewport();
	PC()->InputKey(FInputKeyEventArgs(Viewport ? Viewport->Viewport : nullptr, IPlatformInputDeviceMapper::Get().GetDefaultInputDevice(), Which, bDown ? IE_Pressed : IE_Released, FPlatformTime::Cycles64()));
}

void AHouseSelfTest::HoldW(bool bDown)
{
	if (bDown != bHoldingW)
	{
		bHoldingW = bDown;
		Key(EKeys::W, bDown);
	}
}

void AHouseSelfTest::Tap(const FKey& Which)
{
	Key(Which, true);
	Tapped = Which;
	TapFrames = 3;
}

void AHouseSelfTest::SampleBody()
{
	const AMaraCharacter* M = Mara();
	if (!M || !M->GetMesh())
	{
		return;
	}
	const FVector Head = M->GetMesh()->GetSocketLocation(TEXT("Head"));
	const FVector Pelvis = M->GetMesh()->GetSocketLocation(TEXT("pelvis"));
	const FVector V = M->GetVelocity();
	if (V.Size() > 200.f)
	{
		WorstLead = FMath::Min(WorstLead, FVector::DotProduct((Head - Pelvis).GetSafeNormal(), V.GetSafeNormal()));
	}
	if (M->HasBubble())
	{
		WorstBubble = FMath::Max(WorstBubble, FVector::Dist(M->Bubble->GetComponentLocation(), Head));
	}
}

void AHouseSelfTest::AimAway(const FVector& From)
{
	if (Mara())
	{
		const FVector Here = Mara()->GetActorLocation();
		AimAt(Here + (Here - From).GetSafeNormal2D() * 500.f + FVector(0.f, 0.f, 40.f));
	}
}

void AHouseSelfTest::AimAt(const FVector& Where)
{
	if (PC() && PC()->PlayerCameraManager)
	{
		const FRotator Want = (Where - PC()->PlayerCameraManager->GetCameraLocation()).Rotation();
		// A snap is a cut: no motion blur smeared over the screenshot.
		if (FMath::Abs(FRotator::NormalizeAxis(Want.Yaw - PC()->GetControlRotation().Yaw)) > 10.f)
		{
			PC()->PlayerCameraManager->SetGameCameraCutThisFrame();
		}
		PC()->SetControlRotation(Want);
	}
}

void AHouseSelfTest::Build()
{
	auto GM = [this]() { return GetWorld()->GetAuthGameMode<AHouseGameMode>(); };
	auto Dir = [GM]() { return GM()->GetDirector(); };
	auto Walk = [this](const TCHAR* Tag, float Radius) { return [this, Tag, Radius](float) { return MoveTo(WP(Tag), Radius); }; };
	auto Detail = [Dir](EHouseDetailKind Kind) -> AHouseDetail*
	{
		for (AHouseDetail* D : Dir()->Details)
		{
			if (D && D->Kind == Kind) return D;
		}
		return nullptr;
	};

	Steps.Add({TEXT("start"), []() {}, [this, Dir](float T) {
		if (T < 0.1f) AimAt(WP(TEXT("WP_Door")) + FVector(0.f, 0.f, 120.f));
		if (T < 1.5f) return false;
		Check(Mara() && Mara()->IsDressed() && Dir(), TEXT("Mara is on the jetty; the house director is in the level"));
		Check(Dir()->GetBeat() == EHouseBeat::Outside && Dir()->StormCutoff > 15000.f, TEXT("outside, the storm is heard in full"));
		{
			// Her hand against its place in the bind pose: a T-pose would put it there exactly.
			const USkeletalMeshComponent* Body = Mara()->GetMesh();
			const FReferenceSkeleton& Ref = Body->GetSkinnedAsset()->GetRefSkeleton();
			const FVector Bind = FAnimationRuntime::GetComponentSpaceTransformRefPose(Ref, Ref.FindBoneIndex(TEXT("hand_r"))).GetLocation();
			const float Moved = FVector::Dist(Bind, Body->GetSocketTransform(TEXT("hand_r"), RTS_Component).GetLocation());
			Check(Moved > 10.f, FString::Printf(TEXT("the level opens with her posed, not in a T-pose (hand %.0f cm from the bind pose)"), Moved));
		}
		Shot(TEXT("01_jetty"));
		return true;
	}});
	// Space through the real key path (Enhanced Input), not Jump() called directly.
	Steps.Add({TEXT("space jumps"), [this]() { Key(EKeys::SpaceBar, true); bFlag = false; Mark = 0.f; }, [this](float T) {
		if (T > 0.05f && !bFlag)
		{
			bFlag = true;
			Key(EKeys::SpaceBar, false);
		}
		if (Mara()->GetCharacterMovement()->IsFalling()) Mark = 1.f;
		if (T < 0.6f) return false;
		Check(Mark > 0.f, TEXT("the Space key makes her jump (through the input mappings)"));
		return true;
	}});
	Steps.Add({TEXT("to the door"), []() {}, Walk(TEXT("WP_Door"), 50.f), 15.f});
	Steps.Add({TEXT("inside"), []() {}, [this, Dir](float T) {
		if (!MoveTo(WP(TEXT("WP_Inside")), 50.f)) return false;
		if (T < 1.f) return false;
		Check(Dir()->GetBeat() == EHouseBeat::Inside && Dir()->StormCutoff < 2000.f, FString::Printf(TEXT("through the door, the storm is muffled (low-pass at %.0f Hz)"), Dir()->StormCutoff));
		AimAt(WP(TEXT("WP_Bench")) + FVector(0.f, 0.f, 80.f));
		Shot(TEXT("02_inside"));
		return true;
	}, 12.f});

	// The three details, each looked at for a moment.
	struct FTour { const TCHAR* Wp; EHouseDetailKind Kind; const TCHAR* Pic; const TCHAR* What; };
	for (const FTour& Tour : {FTour{TEXT("WP_Kettle"), EHouseDetailKind::Kettle, TEXT("03_kettle"), TEXT("something funny: the kettle's steam leans toward the drain")},
		FTour{TEXT("WP_Marks"), EHouseDetailKind::HeightMarks, TEXT("04_marks"), TEXT("something comforting: her height marks on the doorframe")},
		FTour{TEXT("WP_Glass"), EHouseDetailKind::WaterGlass, TEXT("05_glass"), TEXT("something wrong: the water climbs out of its glass")}})
	{
		Steps.Add({FString(TEXT("to ")) + Tour.Wp, []() {}, Walk(Tour.Wp, 40.f), 12.f});
		Steps.Add({FString(TEXT("look: ")) + Tour.Pic, []() {}, [this, Tour, Detail, Dir](float T) {
			AHouseDetail* D = Detail(Tour.Kind);
			// The glass is on the windowsill: looking a little down at it raises the camera, so her
			// reflection shows in the window above her own head.
			AimAt(D->GetActorLocation() - FVector(0.f, 0.f, Tour.Kind == EHouseDetailKind::WaterGlass ? 110.f : 0.f));
			if (FMath::IsNearlyEqual(T, 1.3f, 0.03f)) Shot(Tour.Pic);
			if (T < 1.6f) return false;
			Check(D->HasPlayed(), Tour.What);
			if (Tour.Kind == EHouseDetailKind::WaterGlass)
			{
				const AHouseReflection* Mirror = Dir()->Reflection;
				Check(Mirror && Mirror->IsShown() && Mirror->GetDelay() > 0.3f, FString::Printf(TEXT("...and her reflection in the window turns its head late (%.2f s behind)"), Mirror ? Mirror->GetDelay() : 0.f));
			}
			return true;
		}, 6.f});
	}
	Steps.Add({TEXT("echo"), []() {}, [this, Dir](float T) {
		Check(Dir()->Echoes > 3, FString::Printf(TEXT("something under the floor copies her steps (%d echoes)"), Dir()->Echoes));
		return true;
	}});

	// The gauge, and the theft.
	Steps.Add({TEXT("to the bench"), []() {}, Walk(TEXT("WP_Bench"), 35.f), 12.f});
	Steps.Add({TEXT("inspect"), [this]() { bFlag = false; }, [this, Dir, GM](float T) {
		AimAt(Dir()->Gauge->GetActorLocation());
		if (T < 0.5f) return false;
		if (!bFlag)
		{
			bFlag = true;
			Check(Dir()->IsGaugeInReach() && GM()->Prompt.Contains(TEXT("Look")), TEXT("at the bench, the gauge offers [E] Look"));
			Tap(EKeys::E);
		}
		if (Dir()->GetBeat() != EHouseBeat::Inspected) return false;
		Check(true, TEXT("the E key: Ivo's gauge, where he left it (\"He kept it.\")"));
		Shot(TEXT("06_gauge"));
		return true;
	}});
	Steps.Add({TEXT("walk away"), []() {}, Walk(TEXT("WP_Middle"), 40.f), 10.f});
	Steps.Add({TEXT("the theft"), []() {}, [this, Dir](float T) {
		AimAt(Dir()->Gauge->GetActorLocation());
		ANacreTentacle* Te = Dir()->Tentacle;
		if (FMath::IsNearlyEqual(T, 5.0f, 0.03f)) Shot(TEXT("07_tentacle"));
		if (!Te->GetHeld() || T < 5.2f) return false;
		Check(Te->GetHeld() == Dir()->Gauge, TEXT("a tentacle comes up the sink drain and takes the gauge"));
		return true;
	}, 20.f});
	Steps.Add({TEXT("looked at"), []() {}, [this, Dir](float T) {
		AimAt(Dir()->Tentacle->GetTip());
		if (T < 1.f) return false;
		Check(Dir()->bFrozeWhenSeen && Dir()->bSawTentacle, TEXT("looked at, it freezes (\"That is not a pipe.\")"));
		return true;
	}, 6.f});
	Steps.Add({TEXT("look away"), []() {}, [this, Dir](float T) {
		AimAway(Dir()->Tentacle->GetTip());
		if (Dir()->GetBeat() != EHouseBeat::Teacup) return false;
		Check(true, TEXT("looked away from, it creeps on and hides behind the teacup"));
		return true;
	}, 20.f});
	Steps.Add({TEXT("the teacup"), []() {}, [this, Dir](float T) {
		AimAt(Dir()->TeacupSpot);
		if (T < 0.6f) return false;
		Shot(TEXT("08_teacup"));
		return true;
	}});
	Steps.Add({TEXT("to the teacup"), []() {}, Walk(TEXT("WP_Teacup"), 40.f), 10.f});
	Steps.Add({TEXT("the lampshade"), [this]() { Mark = -1.f; }, [this, Dir](float T) {
		// Looked away while it moves (watched, it would freeze), then at the lamp once it is there.
		if (Mark < 0.f && (Dir()->GetBeat() != EHouseBeat::Lamp || !Dir()->Tentacle->IsAtTarget(25.f)))
		{
			AimAway(Dir()->LampSpot);
			return false;
		}
		if (Mark < 0.f) Mark = T;
		AimAt(Dir()->LampSpot);
		if (T - Mark < 0.6f) return false;
		Check(true, TEXT("chased, it slips down the sink and up the floor drain, behind the lampshade"));
		Shot(TEXT("09_lampshade"));
		return true;
	}, 20.f});

	// The searchlight, the grab.
	Steps.Add({TEXT("to the lamp"), []() {}, [this, Dir](float T) {
		return MoveTo(WP(TEXT("WP_Lamp")), 40.f) || Dir()->GetBeat() >= EHouseBeat::Searchlight;
	}, 10.f});
	Steps.Add({TEXT("searchlight"), []() {}, [this, Dir](float T) {
		if (Dir()->GetBeat() != EHouseBeat::Searchlight) return Dir()->GetBeat() > EHouseBeat::Searchlight;
		AimAt(Dir()->Tentacle->GetTip());
		if (Dir()->GetBeatTime() < 1.6f) return false;
		Check(Dir()->Tentacle->GetTint() == ENacreTint::Deep, TEXT("a Watch searchlight: the tentacle flattens, deep blue (\"hide\")"));
		Shot(TEXT("10_searchlight"));
		return true;
	}, 8.f});
	Steps.Add({TEXT("the grab"), [this]() { bFlag = false; }, [this, GM, Dir](float T) {
		UStormCinema* Cin = GM()->Cinema;
		if (Dir()->GetBeat() == EHouseBeat::Grab && Cin->IsPlaying(EStormShot::HouseGrab))
		{
			if (FMath::IsNearlyEqual(Cin->GetTime(), 1.6f, 0.04f)) Shot(TEXT("11_grab"));
			if (FParse::Param(FCommandLine::Get(), TEXT("HouseSkipGrab")) && Cin->GetTime() > 0.9f && !bFlag)
			{
				bFlag = true;
				Tap(EKeys::SpaceBar);
			}
			return false;
		}
		if (Dir()->GetBeat() < EHouseBeat::Descent) return false;
		const bool bSkipped = FParse::Param(FCommandLine::Get(), TEXT("HouseSkipGrab"));
		Check(Cin->LastEnd == (bSkipped ? EShotEnd::Skipped : EShotEnd::Completed) && Cin->Granted[static_cast<int32>(EStormShot::HouseGrab)] == 1, bSkipped ? TEXT("the grab, skipped with Space: granted once") : TEXT("the grab plays to its end once (a short cinematic)"));
		Check(Dir()->Ride->IsRunning() && Mara()->IsInWater() && GM()->Objective.Contains(TEXT("Steer")), TEXT("after the grab: the tow is running, she is held, and the objective says steer"));
		Check(Mara()->HasBubble(), TEXT("she has an air bubble over her head"));
		return true;
	}, 15.f});

	// The descent: no steering at all, and it still cannot be failed.
	Steps.Add({TEXT("descent"), [this]() { bFlag = false; WorstLead = 1.f; WorstBubble = 0.f; }, [this, Dir](float T) {
		ADescentRide* R = Dir()->Ride;
		if (T > 1.5f) SampleBody();
		if (FMath::IsNearlyEqual(R->GetProgress(), 0.15f, 0.01f) && !bFlag) { bFlag = true; Shot(TEXT("12_hallway")); }
		if (FMath::IsNearlyEqual(R->GetProgress(), 0.6f, 0.01f) && bFlag) { bFlag = false; Shot(TEXT("13_flooded")); }
		// The real keys: right in the hall, left down the steep shaft, up in the passage.
		const float P = R->GetProgress();
		const FKey Want = P > 0.05f && P < 0.2f ? EKeys::D : P > 0.3f && P < 0.42f ? EKeys::A : P > 0.55f && P < 0.68f ? EKeys::W : EKeys::Invalid;
		if (Want != Steering)
		{
			if (Steering.IsValid()) Key(Steering, false);
			if (Want.IsValid()) Key(Want, true);
			Steering = Want;
		}
		if (P > 0.05f && P < 0.2f) SteerRight = FMath::Max(SteerRight, static_cast<float>(R->GetOffset().X));
		if (P > 0.3f && P < 0.42f) SteerLeft = FMath::Min(SteerLeft, static_cast<float>(R->GetOffset().X));
		if (P > 0.55f && P < 0.68f) SteerUp = FMath::Max(SteerUp, static_cast<float>(R->GetOffset().Y));
		if (Dir()->GetBeat() != EHouseBeat::Reveal) return false;
		Check(R->IsFinished(), FString::Printf(TEXT("the tow down through the folding house reaches the bottom (%d knocks, no failure)"), R->Bumps));
		Check(Dir()->Under > 0.3f, TEXT("under water: the storm is gone, a heartbeat"));
		Check(SteerRight > 60.f && SteerLeft < -60.f && SteerUp > 60.f, FString::Printf(TEXT("D, A and W steer her: right %.0f in the hall, left %.0f down the shaft, up %.0f (cm)"), SteerRight, SteerLeft, SteerUp));
		Check(WorstLead > 0.5f, FString::Printf(TEXT("towed head first along the path, never inverted (worst lead %.2f)"), WorstLead));
		Check(WorstBubble > 0.f && WorstBubble < 45.f, FString::Printf(TEXT("the bubble stays on her head (worst %.0f cm from the Head bone)"), WorstBubble));
		return true;
	}, 40.f});
	Steps.Add({TEXT("reveal"), []() {}, [this, Dir](float T) {
		// The view is the director's own first framing of the conservatory.
		if (T < 2.f) return false;
		Check(Mara()->GetCharacterMovement()->IsSwimming(), TEXT("in the conservatory she swims"));
		Check(Mara()->GetMesh()->GetSocketLocation(TEXT("Head")).Z > Mara()->GetMesh()->GetSocketLocation(TEXT("pelvis")).Z + 20.f, TEXT("still in the water she floats upright, head up"));
		Shot(TEXT("14_reveal"));
		return true;
	}});
	Steps.Add({TEXT("rise and dive"), [this]() { Key(EKeys::SpaceBar, true); Mark = Mara()->GetActorLocation().Z; bFlag = false; }, [this](float T) {
		if (T > 1.f && !bFlag)
		{
			bFlag = true;
			Key(EKeys::SpaceBar, false);
			Check(Mara()->GetActorLocation().Z > Mark + 80.f, FString::Printf(TEXT("the Space key swims her up (%.0f cm)"), Mara()->GetActorLocation().Z - Mark));
			Mark = Mara()->GetActorLocation().Z;
			Key(EKeys::C, true);
		}
		if (T < 2.f) return false;
		Key(EKeys::C, false);
		Check(Mara()->GetActorLocation().Z < Mark - 80.f, FString::Printf(TEXT("the C key swims her down (%.0f cm)"), Mark - Mara()->GetActorLocation().Z));
		return true;
	}});
	Steps.Add({TEXT("swim to the gauge"), [this]() { WorstLead = 1.f; WorstBubble = 0.f; }, [this, Dir](float T) {
		MoveTo(Dir()->Offer->GetTip(), 120.f);
		SampleBody();
		// Once its arm has come up out of the dark and stopped.
		return Dir()->IsOfferInReach() && Dir()->Offer->IsAtTarget(30.f);
	}, 25.f});
	Steps.Add({TEXT("take it"), [this]() { bFlag = false; }, [this, Dir, GM](float T) {
		AimAt(Dir()->Offer->GetTip());
		if (T < 0.5f) return false;
		// Worst moment, reversing to follow the arm: she must never trail her head behind her feet.
		Check(WorstLead > 0.f, FString::Printf(TEXT("she swims head first, never feet first (worst lead %.2f)"), WorstLead));
		Check(WorstBubble > 0.f && WorstBubble < 45.f, FString::Printf(TEXT("the bubble stays on her head while swimming (worst %.0f cm)"), WorstBubble));
		if (!bFlag)
		{
			bFlag = true;
			Check(GM()->Prompt.Contains(TEXT("Take")), TEXT("Nacre holds the gauge out: [E] Take it"));
			Tap(EKeys::E);
		}
		if (Dir()->GetBeat() != EHouseBeat::Returned) return false;
		Check(Dir()->Gauge->GetAttachParentActor() == Mara(), TEXT("the E key: she takes it back"));
		return true;
	}});
	Steps.Add({TEXT("thanks"), []() {}, [this, Dir, GM](float T) {
		AimAt(Dir()->Offer->GetTip());
		if (FMath::IsNearlyEqual(T, 1.0f, 0.03f)) Shot(TEXT("15_coral"));
		if (!GM()->bComplete) return false;
		Check(Dir()->Taps == 3 && Dir()->Offer->GetTint() == ENacreTint::Coral, TEXT("Nacre flushes coral and taps the glass three times"));
		Check(true, TEXT("the slice ends: to be continued"));
		Shot(TEXT("16_end"));
		return true;
	}, 10.f});
}

void AHouseSelfTest::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (QuitIn >= 0.f)
	{
		QuitIn -= DeltaSeconds;
		if (bStopAudio && QuitIn < 2.f)
		{
			bStopAudio = false;
			Log(TEXT("recording ends"));
			UAudioMixerBlueprintLibrary::StopRecordingOutput(this, EAudioRecordingExportType::WavFile, TEXT("output"), OutDir);
		}
		if (QuitIn < 0.f)
		{
			FPlatformMisc::RequestExit(false);
		}
		return;
	}
	if (bDone)
	{
		return;
	}
#if WITH_EDITOR
	if (GShaderCompilingManager && GShaderCompilingManager->GetNumRemainingJobs() > 0 && Index < 0)
	{
		return;
	}
#endif
	if (!Mara())
	{
		return;
	}
	Total += DeltaSeconds;
	if (Index >= 0)
	{
		++Frames;
		FrameSum += DeltaSeconds * 1000.0;
		FramesOver33 += DeltaSeconds > 0.0334f ? 1 : 0;
	}
	if (Index < 0)
	{
		Index = 0;
		StepT = 0.f;
		// What the game itself sends to the speakers, for measuring the mix (no capture software's gain).
		bRecording = FParse::Param(FCommandLine::Get(), TEXT("HouseRecordAudio"));
		if (bRecording)
		{
			UAudioMixerBlueprintLibrary::StartRecordingOutput(this, 240.f);
		}
		Log(FString::Printf(TEXT("-- %s"), *Steps[0].Name));
		Steps[0].Start();
	}
	if (TapFrames > 0 && --TapFrames == 0)
	{
		Key(Tapped, false);
	}
	++StepFrames;
	StepSum += DeltaSeconds * 1000.0;
	StepGame += FPlatformTime::ToMilliseconds(GGameThreadTime);
	StepRender += FPlatformTime::ToMilliseconds(GRenderThreadTime);
	StepGpu += FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
	FStep& S = Steps[Index];
	const bool bFinished = S.Update(StepT);
	StepT += DeltaSeconds;
	if (!bFinished && StepT > S.Timeout)
	{
		Check(false, FString::Printf(TEXT("step \"%s\" timed out after %.0f s"), *S.Name, S.Timeout));
	}
	if (bFinished || StepT > S.Timeout)
	{
		HoldW(false);
		if (StepT > 1.f)
		{
			const double N = FMath::Max(StepFrames, 1);
			Log(FString::Printf(TEXT("cost %s: %d frames, mean %.1f ms (game %.1f, render %.1f, GPU %.1f)"), *S.Name, StepFrames, StepSum / N, StepGame / N, StepRender / N, StepGpu / N));
		}
		StepFrames = 0;
		StepSum = StepGame = StepRender = StepGpu = 0.0;
		++Index;
		StepT = 0.f;
		if (Index >= Steps.Num())
		{
			bDone = true;
			Log(FString::Printf(TEXT("frames: %d, mean %.1f ms, %d over 33 ms"), Frames, Frames ? FrameSum / Frames : 0.0, FramesOver33));
			Log(FString::Printf(TEXT("SELFTEST RESULT: %d passed, %d failed, %.1f s"), Passed, Failed, Total));
			// A recording holds the end card for a few seconds, then stops while the window is still open.
			bStopAudio = bRecording || FParse::Param(FCommandLine::Get(), TEXT("StormRecordAudio"));
			QuitIn = bStopAudio ? 6.f : 1.5f;
			return;
		}
		Log(FString::Printf(TEXT("-- %s"), *Steps[Index].Name));
		Steps[Index].Start();
	}
}
