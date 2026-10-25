#include "Stormworks/StormworksSelfTest.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/AudioComponent.h"
#include "Sound/SoundBase.h"
#include "UObject/UObjectIterator.h"
#include "EngineUtils.h"
#include "Engine/GameViewportClient.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/TargetPoint.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "GenericPlatform/GenericPlatformInputDeviceMapper.h"
#include "InputKeyEventArgs.h"
#include "HAL/PlatformProcess.h"
#include "InputMappingContext.h"
#include "Kismet/GameplayStatics.h"
#include "ItTakesOne.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Stormworks/CollapsingWalkway.h"
#include "Stormworks/MaraAnimInstance.h"
#include "Stormworks/MaraFace.h"
#include "Stormworks/LaundryLine.h"
#include "Stormworks/MaraFootsteps.h"
#include "Stormworks/WindChimes.h"
#include "Stormworks/WorkshopToy.h"
#include "Stormworks/StormCheckpoint.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormMusic.h"
#include "Stormworks/StormDirector.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/StoryNote.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/TetherMovable.h"
#include "Stormworks/TetherPickup.h"
#include "Stormworks/TetherPoint.h"
#include "RenderTimer.h"
#include "RHI.h"
#include "ShaderCompiler.h"
#include "UnrealClient.h"

AStormworksSelfTest::AStormworksSelfTest()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PrePhysics;
}

void AStormworksSelfTest::BeginPlay()
{
	Super::BeginPlay();
	OutDir = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("StormworksSelfTest"));
	IFileManager::Get().MakeDirectory(*OutDir, true);
	// The bot plays alone: a click or a key from whoever is at the machine must not skip a
	// cinematic or fire the tether. (Injected Enhanced Input actions do not go through the viewport.)
	if (UGameViewportClient* Viewport = GetWorld()->GetGameViewport())
	{
		Viewport->SetIgnoreInput(true);
	}
	bClip = FParse::Param(FCommandLine::Get(), TEXT("StormClip"));
	if (bClip)
	{
		IFileManager::Get().MakeDirectory(*FPaths::Combine(OutDir, TEXT("clip")), true);
	}
	Log(TEXT("Stormworks self-test: start"));
	Build();
}

void AStormworksSelfTest::Log(const FString& Line)
{
	const FString Stamped = FString::Printf(TEXT("[%6.2f] %s"), Total, *Line);
	UE_LOG(LogStormworks, Display, TEXT("SELFTEST %s"), *Stamped);
	// The whole file each time: appends from a game process proved unreliable here.
	Results += Stamped + LINE_TERMINATOR;
	FFileHelper::SaveStringToFile(Results, *FPaths::Combine(OutDir, TEXT("results.txt")), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
}

void AStormworksSelfTest::Check(bool bOk, const FString& What)
{
	(bOk ? Passed : Failed) += 1;
	Log(FString::Printf(TEXT("%s  %s"), bOk ? TEXT("PASS") : TEXT("FAIL"), *What));
}

void AStormworksSelfTest::Shot(const FString& Name)
{
	FScreenshotRequest::RequestScreenshot(FPaths::Combine(OutDir, Name + TEXT(".png")), true, false);
	Log(FString::Printf(TEXT("screenshot %s"), *Name));
}

ACharacter* AStormworksSelfTest::Char() const
{
	APlayerController* P = PC();
	return P ? Cast<ACharacter>(P->GetPawn()) : nullptr;
}

APlayerController* AStormworksSelfTest::PC() const
{
	return GetWorld()->GetFirstPlayerController();
}

FString AStormworksSelfTest::BucketLine(const TCHAR* Name, const FFrameBucket& B) const
{
	const double N = FMath::Max(1, B.Frames);
	return FString::Printf(TEXT("frame cost, %s: %d frames, mean %.1f ms (game thread %.1f, render thread %.1f, GPU %.1f), %d over 33 ms"),
		Name, B.Frames, B.Frame / N, B.Game / N, B.Render / N, B.Gpu / N, B.Over33);
}

void AStormworksSelfTest::CheckShotEnd(EStormShot Shot, EShotEnd Reason, const TCHAR* What)
{
	const UStormCinema* Cin = GetWorld()->GetAuthGameMode<AStormworksGameMode>()->Cinema;
	const bool bCamera = PC()->GetViewTarget() == Char();
	const bool bControls = !PC()->IsMoveInputIgnored() && !PC()->IsLookInputIgnored() && Char()->InputEnabled();
	const int32 Granted = Cin->Granted[static_cast<int32>(Shot)];
	static const TCHAR* Ends[] = {TEXT("completed"), TEXT("skipped"), TEXT("cancelled")};
	Check(!Cin->IsPlaying() && Cin->LastEnd == Reason && Granted == 1 && bCamera && bControls,
		FString::Printf(TEXT("%s: %s, granted once (%d), camera %s, controls %s"), What, Ends[static_cast<int32>(Cin->LastEnd)], Granted, bCamera ? TEXT("back on her") : TEXT("NOT back"), bControls ? TEXT("back") : TEXT("NOT back")));
}

AActor* AStormworksSelfTest::Tagged(const FName& Tag) const
{
	for (TActorIterator<AActor> It(GetWorld()); It; ++It)
	{
		if (It->Tags.Contains(Tag))
		{
			return *It;
		}
	}
	return nullptr;
}

FVector AStormworksSelfTest::WP(const FName& Tag) const
{
	const AActor* A = Tagged(Tag);
	if (!A)
	{
		UE_LOG(LogStormworks, Error, TEXT("SELFTEST missing waypoint %s"), *Tag.ToString());
		return FVector::ZeroVector;
	}
	return A->GetActorLocation();
}

ATetherPoint* AStormworksSelfTest::Ring(const FName& Tag) const
{
	return Cast<ATetherPoint>(Tagged(Tag));
}

bool AStormworksSelfTest::MoveTo(const FVector& Where, float Radius)
{
	ACharacter* C = Char();
	if (!C)
	{
		return false;
	}
	FVector D = Where - C->GetActorLocation();
	D.Z = 0.f;
	if (D.Size() <= Radius)
	{
		return true;
	}
	C->AddMovementInput(D.GetSafeNormal(), 1.f);
	// Look the way she walks, as a player would.
	if (APlayerController* P = PC())
	{
		const FRotator Want(-12.f, D.Rotation().Yaw, 0.f);
		P->SetControlRotation(FMath::RInterpTo(P->GetControlRotation(), Want, GetWorld()->GetDeltaSeconds(), 6.f));
	}
	return false;
}

void AStormworksSelfTest::AimAt(const FVector& Where)
{
	if (APlayerController* P = PC())
	{
		if (P->PlayerCameraManager)
		{
			const FVector From = P->PlayerCameraManager->GetCameraLocation();
			P->SetControlRotation((Where - From).Rotation());
		}
	}
}

void AStormworksSelfTest::Stop()
{
	if (ACharacter* C = Char())
	{
		C->GetCharacterMovement()->StopMovementImmediately();
	}
}

void AStormworksSelfTest::Build()
{
	auto GM = [this]() { return GetWorld()->GetAuthGameMode<AStormworksGameMode>(); };
	auto Tether = [this]() { return Char() ? Char()->FindComponentByClass<UTetherComponent>() : nullptr; };
	auto Movable = [this](const FName& Tag) { return Cast<ATetherMovable>(Tagged(Tag)); };
	auto Director = [this]() { return GetWorld()->GetAuthGameMode<AStormworksGameMode>()->GetDirector(); };
	auto Walk = [this](FName Tag, float Radius = 60.f) { return [this, Tag, Radius](float) { return MoveTo(WP(Tag), Radius); }; };
	auto Wait = [](float Seconds) { return [Seconds](float T) { return T >= Seconds; }; };

	// --- Beat 1: the start, the view.
	// --- The opening: it plays to the end by itself (natural completion).
	Steps.Add({TEXT("opening plays"), [this, GM]() { bFlag = false; GM()->Cinema->Play(EStormShot::Opening); }, [this, GM](float T) {
		const UStormCinema* Cin = GM()->Cinema;
		if (T < 0.3f) return false;
		if (!bFlag)
		{
			bFlag = true;
			Check(Cin->IsPlaying(EStormShot::Opening) && PC()->GetViewTarget() != Char() && PC()->IsMoveInputIgnored() && !Char()->InputEnabled(),
				FString::Printf(TEXT("the opening plays (%.1f s): its own camera, her controls taken"), Cin->GetLength()));
		}
		if (FMath::IsNearlyEqual(T, 1.2f, 0.03f)) Shot(TEXT("00a_opening"));
		if (FMath::IsNearlyEqual(T, 6.6f, 0.03f)) Shot(TEXT("00b_opening_mara"));
		return !Cin->IsPlaying();
	}, 15.f});
	Steps.Add({TEXT("opening ends"), []() {}, [this, GM](float T) {
		if (T < 1.0f) return false;
		CheckShotEnd(EStormShot::Opening, EShotEnd::Completed, TEXT("the opening ends by itself"));
		Check(GM()->Music->GetMood() == EStormMood::Workshop, FString::Printf(TEXT("the workshop's music comes in (%s)"), *GM()->Music->GetTrack().ToString()));
		return true;
	}});

	// --- Mara: her meshes, her animation, a look at her from the front.
	Steps.Add({TEXT("mara"), [this]() {}, [this](float T) {
		if (T < 0.1f)
		{
			// Turn the camera round to her front, a little above her eyes.
			if (APlayerController* P = PC())
			{
				P->SetControlRotation(FRotator(-12.f, Char()->GetActorRotation().Yaw + 160.f, 0.f));
			}
			return false;
		}
		if (T < 1.0f) return false;
		TArray<USkeletalMeshComponent*> Meshes;
		Char()->GetComponents<USkeletalMeshComponent>(Meshes);
		const UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(Char()->GetMesh()->GetAnimInstance());
		Check(Anim != nullptr && Anim->Clips.Num() >= 20 && Meshes.Num() > 1, FString::Printf(TEXT("the hero is Mara: her animation (%d clips) on %d mesh parts"), Anim ? Anim->Clips.Num() : 0, Meshes.Num()));
		Check(FMath::IsNearlyEqual(Char()->GetCapsuleComponent()->GetUnscaledCapsuleHalfHeight(), 66.f, 1.f), TEXT("her capsule fits her 1.3 m"));
		const UMaraFace* Face = Char()->FindComponentByClass<UMaraFace>();
		Check(Face && Face->Eyes == 2 && Face->Tails == 2, FString::Printf(TEXT("her face: %d eyes that turn and blink, %d scarf tails"), Face ? Face->Eyes : 0, Face ? Face->Tails : 0));
		Shot(TEXT("00_mara"));
		return true;
	}, 6.f});
	// The lids, held shut for a picture: they must close over the eyes, not fold back.
	Steps.Add({TEXT("lids"), [this]() { if (UMaraFace* F = Char()->FindComponentByClass<UMaraFace>()) F->ForceClosure = 1.f; }, [this](float T) {
		UMaraFace* F = Char()->FindComponentByClass<UMaraFace>();
		if (!F) return true;
		if (T < 0.4f) return false;
		if (!bFlag)
		{
			bFlag = true;
			Check(F->GetLidClosure() > 0.9f, FString::Printf(TEXT("the lids shut (%.2f)"), F->GetLidClosure()));
			Shot(TEXT("00c_lids_shut"));
			return false;
		}
		if (T < 0.8f) return false;
		F->ForceClosure = -1.f;
		bFlag = false;
		return true;
	}});
	Steps.Add({TEXT("start"), [this]() {}, [this, GM, Tether](float T) {
		if (T < 2.5f)
		{
			if (T < 0.1f)
			{
				// The lighthouse beside her in the window, not behind her head.
				AimAt(WP(TEXT("WP_Lighthouse")) + FVector(0.f, 4500.f, -800.f));
			}
			return false;
		}
		Check(Char() != nullptr, TEXT("the player character spawned"));
		Check(Tether() != nullptr && !Tether()->bHasTether, TEXT("the tether component is there, not yet picked up"));
		Check(GM()->Checkpoint && GM()->Checkpoint->Order == 0, TEXT("starts at checkpoint 0"));
		Check(!GM()->Objective.IsEmpty(), FString::Printf(TEXT("an objective is shown: \"%s\""), *GM()->Objective));
		Shot(TEXT("01_workshop_window"));
		return true;
	}, 10.f});
	// Space through the real key path (Enhanced Input), not Jump() called directly: the tether's
	// own mapping also listens to Space and must not swallow it.
	Steps.Add({TEXT("space jumps"), [this]() { PC()->InputKey(FInputKeyEventArgs(GetWorld()->GetGameViewport() ? GetWorld()->GetGameViewport()->Viewport : nullptr, IPlatformInputDeviceMapper::Get().GetDefaultInputDevice(), EKeys::SpaceBar, IE_Pressed, FPlatformTime::Cycles64())); bFlag = false; Mark = 0.f; }, [this](float T) {
		if (T > 0.05f && !bFlag)
		{
			bFlag = true;
			PC()->InputKey(FInputKeyEventArgs(GetWorld()->GetGameViewport() ? GetWorld()->GetGameViewport()->Viewport : nullptr, IPlatformInputDeviceMapper::Get().GetDefaultInputDevice(), EKeys::SpaceBar, IE_Released, FPlatformTime::Cycles64()));
		}
		if (Char()->GetCharacterMovement()->IsFalling()) Mark = 1.f;
		if (T < 0.8f) return false;
		Check(Mark > 0.f, TEXT("the Space key makes her jump (through the input mappings)"));
		bFlag = false;
		return true;
	}});
	Steps.Add({TEXT("no tether yet"), [this, Tether]() { Count0 = Tether()->Fires; Tether()->TryFire(); }, [this, Tether](float T) {
		if (T < 0.3f) return false;
		Check(Tether()->Fires == Count0, TEXT("before the pickup, Tether does nothing"));
		return true;
	}});

	// --- Beat 2: learn safely.
	// --- Ivo's toy: E winds it; a second press while it runs does nothing; winding it again sends
	// it back where it started.
	auto Toy = [this]() { TActorIterator<AWorkshopToy> It(GetWorld()); return It ? *It : nullptr; };
	Steps.Add({TEXT("to the toy"), []() {}, Walk(TEXT("WP_Toy"), 30.f), 10.f});
	Steps.Add({TEXT("wind the toy"), [this]() { Stop(); bFlag = false; }, [this, GM, Toy](float T) {
		AimAt(Toy()->GetActorLocation());
		if (T < 0.4f) return false;
		if (!bFlag)
		{
			bFlag = true;
			Check(GM()->ToyInReach(Char()) == Toy(), TEXT("in front of the bench, the toy is in reach ([E] Wind up)"));
			Count0 = Toy()->Plays;
			GM()->TryInteract(Char());
			GM()->TryInteract(Char());
			Check(Toy()->IsPlaying(), TEXT("E winds the toy"));
			return false;
		}
		if (T > 1.0f)
		{
			// Over her shoulder, down at the bench, for the picture.
			AimAt(Toy()->GetActorLocation() - FVector(0.f, 0.f, 140.f));
		}
		if (FMath::IsNearlyEqual(T, 1.4f, 0.03f)) Shot(TEXT("01b_toy"));
		if (Toy()->IsPlaying()) return false;
		Check(Toy()->Plays == Count0 + 1 && FMath::IsNearlyEqual(Toy()->GetOffset(), 28.f, 1.f), FString::Printf(TEXT("one run (a second press while it ran did nothing), %.0f cm along the bench"), Toy()->GetOffset()));
		return true;
	}, 8.f});
	Steps.Add({TEXT("wind it back"), [this, GM]() { GM()->TryInteract(Char()); }, [this, Toy](float T) {
		AimAt(Toy()->GetActorLocation());
		if (T < 0.2f || Toy()->IsPlaying()) return false;
		Check(Toy()->Plays == Count0 + 2 && FMath::Abs(Toy()->GetOffset()) < 1.f, TEXT("wound again, it runs back to where it started"));
		return true;
	}, 8.f});
	Steps.Add({TEXT("pick up the tether"), []() {}, Walk(TEXT("WP_Pickup"), 40.f), 15.f});
	Steps.Add({TEXT("picked up"), []() {}, [this, Tether, GM](float T) {
		if (T < 0.4f) return false;
		Check(Tether()->bHasTether, TEXT("walking to the workbench picks up the tether"));
		Shot(TEXT("02_tether_picked_up"));
		return true;
	}});
	Steps.Add({TEXT("to the door"), []() {}, Walk(TEXT("WP_DoorView"), 40.f), 15.f});
	Steps.Add({TEXT("aim at the door crate"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_Door"))->GetAttachLocation());
		const bool bOk = Tether()->GetTarget() == Ring(TEXT("Ring_Door"));
		if (T < 0.4f || (!bOk && T < 1.2f)) return false;
		Check(bOk, TEXT("the door crate's ring is targeted"));
		Shot(TEXT("03_target_door_crate"));
		return true;
	}});
	Steps.Add({TEXT("pull the door crate"), [this, Tether]() { Tether()->TryFire(); }, [this, Movable](float T) {
		if (FMath::IsNearlyEqual(T, 0.5f, 0.02f)) Shot(TEXT("04_pulling_door_crate"));
		ATetherMovable* M = Movable(TEXT("Crate_Door"));
		if (T < 0.6f || M->IsMoving()) return false;
		Check(M->IsAtEnd() && M->Arrivals == 1, TEXT("one tug runs the crate off the doorway"));
		return true;
	}, 8.f});
	Steps.Add({TEXT("into the corridor"), []() {}, Walk(TEXT("WP_Corridor1"), 40.f), 10.f});
	Steps.Add({TEXT("repeat: pull it back and again"), [this]() { Stop(); Pos0 = Char()->GetActorLocation(); }, [this, Tether, Movable](float T) {
		ATetherMovable* M = Movable(TEXT("Crate_Door"));
		AimAt(Ring(TEXT("Ring_Door"))->GetAttachLocation());
		if (Tether()->GetState() == ETetherState::Idle && !M->IsMoving() && M->Arrivals < 3 && T > 0.3f)
		{
			Tether()->TryFire();
		}
		if (M->Arrivals < 3 || M->IsMoving()) return false;
		Check(M->IsAtEnd(), TEXT("repeating the interaction: back over the door and off again, three arrivals, ends open"));
		return true;
	}, 15.f});
	Steps.Add({TEXT("leave"), []() {}, Walk(TEXT("WP_Gallery"), 50.f), 10.f});
	// Back to where she stood when she used it: the ring sits just round the corridor wall, so a
	// stop half a metre further north would (correctly) have no line of sight to it.
	Steps.Add({TEXT("return"), []() {}, [this](float) { return MoveTo(Pos0, 15.f); }, 10.f});
	Steps.Add({TEXT("still targetable"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_Door"))->GetAttachLocation());
		const bool bOk = Tether()->GetTarget() == Ring(TEXT("Ring_Door"));
		if (T < 0.3f || (!bOk && T < 1.2f)) return false;
		Check(bOk, TEXT("after walking away and back, the ring is targeted again"));
		return true;
	}});

	// --- Through the corridor to the gallery.
	Steps.Add({TEXT("corridor 2"), []() {}, Walk(TEXT("WP_Corridor2")), 12.f});
	Steps.Add({TEXT("gallery"), []() {}, Walk(TEXT("WP_Gallery")), 12.f});
	Steps.Add({TEXT("gallery north"), []() {}, Walk(TEXT("WP_GalleryN")), 15.f});
	// --- The washing along the gallery: swinging in the wind, flapping as she runs past.
	auto Laundry = [this]() { TActorIterator<ALaundryLine> It(GetWorld()); return It ? *It : nullptr; };
	Steps.Add({TEXT("laundry"), [this]() { Stop(); }, [this, Laundry](float T) {
		// Straight across at the washing on the wall, from over the sea (along the rope it is edge-on).
		AimAt(FVector(800.f, 950.f, 190.f));
		if (T < 0.6f) return false;
		const float Swing = Laundry()->SwingNear(Char()->GetActorLocation());
		Check(FMath::Abs(Swing) > 4.f && Laundry()->Brushes > 0, FString::Printf(TEXT("the washing swings in the wind (%.0f degrees) and flapped as she ran past (%d)"), Swing, Laundry()->Brushes));
		Shot(TEXT("04b_laundry"));
		return true;
	}});
	Steps.Add({TEXT("gallery checkpoint"), []() {}, [this, GM](float T) {
		Check(GM()->Checkpoint && GM()->Checkpoint->Order >= 1, TEXT("the gallery checkpoint is reached"));
		return true;
	}});
	Steps.Add({TEXT("chasm edge"), []() {}, Walk(TEXT("WP_ChasmEdge"), 35.f), 12.f});

	// --- Beat 3: observe, reposition, traverse.
	Steps.Add({TEXT("the anchor is too far"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_A1"))->GetAttachLocation());
		if (T < 0.5f) return false;
		Check(Tether()->GetTarget() != Ring(TEXT("Ring_A1")) && Tether()->GetOutOfReach() == Ring(TEXT("Ring_A1")), TEXT("from the edge, the far anchor shows as too far"));
		Count0 = Tether()->TooFar;
		Tether()->TryFire();
		Check(Tether()->TooFar == Count0 + 1 && Tether()->GetState() == ETetherState::Idle, TEXT("firing at it is refused (too far), nothing flies"));
		Shot(TEXT("05_anchor_too_far"));
		const AWindChimes* Chimes = [this]() { TActorIterator<AWindChimes> It(GetWorld()); return It ? *It : nullptr; }();
		Check(Chimes && Chimes->Rings >= 1 && Chimes->Notes >= 5, FString::Printf(TEXT("walking up to the edge rings Ivo's chimes down the scale (%d rings, %d notes)"), Chimes ? Chimes->Rings : 0, Chimes ? Chimes->Notes : 0));
		return true;
	}});
	Steps.Add({TEXT("aim at the cargo crate"), []() {}, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_Chasm"))->GetAttachLocation());
		if (T < 0.4f) return false;
		Check(Tether()->GetTarget() == Ring(TEXT("Ring_Chasm")), TEXT("the cargo crate's ring is targeted"));
		return true;
	}});
	Steps.Add({TEXT("pull the cargo crate"), [this, Tether]() { Tether()->TryFire(); }, [this, Movable](float T) {
		ATetherMovable* M = Movable(TEXT("Crate_Chasm"));
		if (FMath::IsNearlyEqual(T, 1.2f, 0.02f)) Shot(TEXT("06_pulling_cargo_crate"));
		if (T < 0.6f || M->IsMoving()) return false;
		Check(M->IsAtEnd(), TEXT("the cargo crate runs along its girder to the near edge"));
		return true;
	}, 10.f});
	Steps.Add({TEXT("onto the crate"), []() {}, Walk(TEXT("WP_CrateFront"), 40.f), 10.f});
	Steps.Add({TEXT("on the crate"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_A1"))->GetAttachLocation());
		if (T < 0.5f) return false;
		Check(Char()->GetActorLocation().Z > -20.f, TEXT("she is standing on the crate, not in the sea"));
		Check(Tether()->GetTarget() == Ring(TEXT("Ring_A1")), TEXT("from the crate, the far anchor is in reach"));
		return true;
	}});
	Steps.Add({TEXT("tether across"), [this, Tether]() { bFlag = false; Count0 = Tether()->ReelArrivals; Tether()->TryFire(); }, [this, Tether, GM](float T) {
		if (!bFlag && T > 0.45f)
		{
			// A hitch in mid-flight, on purpose (a player's PC loading something): she must stay on
			// the arc and land where she would have.
			bFlag = true;
			Shot(TEXT("07_tether_across"));
			FPlatformProcess::Sleep(0.3f);
			bSkipFrameStat = true;
			Log(TEXT("a 0.3 s stall in mid-carry"));
		}
		if (T < 1.0f || !Char()->GetCharacterMovement()->IsMovingOnGround()) return false;
		Check(Tether()->ReelArrivals == Count0 + 1, TEXT("the tether carries her across the gap, despite the stall"));
		Check(FVector::Dist2D(Char()->GetActorLocation(), WP(TEXT("WP_FarLanding"))) < 200.f, TEXT("she lands on the far gallery"));
		return true;
	}, 6.f});
	Steps.Add({TEXT("far checkpoint"), []() {}, [this, GM](float T) {
		if (T < 0.3f) return false;
		Check(GM()->Checkpoint && GM()->Checkpoint->Order >= 2, TEXT("the far gallery checkpoint is reached"));
		return true;
	}});

	// --- A missed jump and the recovery.
	Steps.Add({TEXT("fall off the far edge"), [this, GM]() { Count0 = GM()->Falls; }, [this, GM](float T) {
		if (GM()->Falls == Count0)
		{
			MoveTo(WP(TEXT("WP_FallOff")), 10.f);
			return false;
		}
		return T > 0.3f;
	}, 10.f});
	Steps.Add({TEXT("recovered"), []() {}, [this, GM, Movable](float T) {
		if (T < 0.8f) return false;
		Check(GM()->Falls == Count0 + 1, TEXT("falling into the sea counts one fall"));
		Check(FVector::Dist(Char()->GetActorLocation(), GM()->Checkpoint->GetSpawnLocation()) < 150.f, TEXT("she is back at the far gallery checkpoint"));
		Check(Movable(TEXT("Crate_Chasm"))->IsAtEnd(), TEXT("the crate stays where she pulled it (nothing solved is undone)"));
		Shot(TEXT("08_after_fall_recovery"));
		return true;
	}});

	// --- Beat 4: the coupling.
	Steps.Add({TEXT("to the coupling"), []() {}, Walk(TEXT("WP_Coupling"), 40.f), 12.f});
	Steps.Add({TEXT("engage the coupling"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_Coupling"))->GetAttachLocation());
		if (T < 0.4f) return false;
		Check(Tether()->GetTarget() == Ring(TEXT("Ring_Coupling")), TEXT("the storm coupling's ring is targeted"));
		Tether()->TryFire();
		return true;
	}});
	Steps.Add({TEXT("the storm engine"), []() {}, [this, Director, Movable, GM](float T) {
		if (FMath::IsNearlyEqual(T, 1.6f, 0.02f)) Shot(TEXT("09_storm_engine_live"));
		ATetherMovable* Gate = Movable(TEXT("Gate"));
		if (!Director()->bEngaged || !Gate->IsAtEnd()) return false;
		Check(Director()->bEngaged, TEXT("engaging the coupling starts the storm engine"));
		Check(Gate->IsAtEnd(), TEXT("the sluice gate opens"));
		Check(Director()->Walkway->bArmed, TEXT("the old catwalk is armed"));
		return true;
	}, 12.f});
	// The engine reveal is past half-way once the gate has opened: skip it there.
	Steps.Add({TEXT("engine reveal"), []() {}, [this, GM](float T) {
		UStormCinema* Cin = GM()->Cinema;
		if (!Cin->IsPlaying(EStormShot::EngineReveal))
		{
			Check(false, TEXT("pulling the coupling plays the engine reveal"));
			return true;
		}
		if (Cin->GetTime() < 0.45f * Cin->GetLength()) return false;
		Log(FString::Printf(TEXT("skipping the engine reveal at %.1f of %.1f s"), Cin->GetTime(), Cin->GetLength()));
		Cin->Skip();
		return true;
	}, 8.f});
	Steps.Add({TEXT("engine reveal ends"), []() {}, [this, GM, Director](float T) {
		if (T < 0.6f) return false;
		CheckShotEnd(EStormShot::EngineReveal, EShotEnd::Skipped, TEXT("the engine reveal, skipped half-way"));
		Check(GM()->Objective == Director()->EngagedObjective && GM()->Music->GetMood() == EStormMood::Escape, TEXT("skipping it still sets the catwalk objective and the escape music"));
		return true;
	}});
	Steps.Add({TEXT("to the gate"), []() {}, Walk(TEXT("WP_GateFront"), 50.f), 10.f});
	Steps.Add({TEXT("climax checkpoint"), []() {}, [this, GM](float T) {
		Check(GM()->Checkpoint && GM()->Checkpoint->Order >= 3, TEXT("the climax checkpoint is reached"));
		return true;
	}});

	// --- Beat 5, attempt 1: hesitate on the catwalk and fall with it.
	Steps.Add({TEXT("hesitate on the catwalk"), [this, GM]() { Count0 = GM()->Falls; }, [this, GM](float T) {
		if (GM()->Falls == Count0)
		{
			MoveTo(WP(TEXT("WP_Cat1")), 40.f);
			return false;
		}
		return true;
	}, 15.f});
	Steps.Add({TEXT("walkway reset"), []() {}, [this, Director, GM](float T) {
		if (T < 0.5f) return false;
		ACollapsingWalkway* W = Director()->Walkway;
		bool bAll = true;
		for (ACollapsingSegment* S : W->Segments)
		{
			bAll &= S && S->IsStanding();
		}
		Check(W->Runs == 1 && !W->bRunning && bAll, TEXT("falling with the catwalk resets it: every segment back, not running"));
		Check(GM()->Checkpoint->Order >= 3 && FVector::Dist(Char()->GetActorLocation(), GM()->Checkpoint->GetSpawnLocation()) < 150.f, TEXT("back at the climax checkpoint"));
		return true;
	}});

	// --- Beat 5, attempt 2: the run.
	Steps.Add({TEXT("run 1"), []() {}, Walk(TEXT("WP_Cat1"), 60.f), 8.f});
	Steps.Add({TEXT("run 2"), [this]() { Mark = Total; }, [this](float T) {
		if (FMath::IsNearlyEqual(T, 0.5f, 0.02f)) Shot(TEXT("10_climax_run"));
		return MoveTo(WP(TEXT("WP_Cat2End")), 40.f);
	}, 8.f});
	Steps.Add({TEXT("tether A2"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_A2"))->GetAttachLocation());
		if (T < 0.15f) return false;
		if (Tether()->GetTarget() != Ring(TEXT("Ring_A2")))
		{
			return T > 1.0f;
		}
		Count0 = Tether()->ReelArrivals;
		Tether()->TryFire();
		return true;
	}, 3.f});
	Steps.Add({TEXT("across G1"), []() {}, [this, Tether](float T) {
		if (FMath::IsNearlyEqual(T, 0.5f, 0.02f)) Shot(TEXT("11_climax_tether"));
		if (T < 0.8f || !Char()->GetCharacterMovement()->IsMovingOnGround()) return false;
		Check(Tether()->ReelArrivals == Count0 + 1, TEXT("climax: carried over the first break"));
		return true;
	}, 5.f});
	Steps.Add({TEXT("run 3"), []() {}, Walk(TEXT("WP_Cat3"), 60.f), 6.f});
	Steps.Add({TEXT("jump G2"), [this]() { bFlag = false; Pos0.X = Mark; }, [this](float T) {
		ACharacter* C = Char();
		const FVector Land = WP(TEXT("WP_Cat5"));
		if (!bFlag && C->GetActorLocation().X > WP(TEXT("WP_Cat4End")).X)
		{
			C->Jump();
			bFlag = true;
			Log(FString::Printf(TEXT("jump at x %.0f, speed %.0f, mode %d"), C->GetActorLocation().X, C->GetVelocity().Size2D(), int32(C->GetCharacterMovement()->MovementMode.GetValue())));
			LogMark = Total;
			Mark = Total;
		}
		if (bFlag && Total - LogMark > 0.2f)
		{
			LogMark = Total;
			Log(FString::Printf(TEXT("  x %.0f z %.0f vz %.0f mode %d"), C->GetActorLocation().X, C->GetActorLocation().Z, C->GetVelocity().Z, int32(C->GetCharacterMovement()->MovementMode.GetValue())));
		}
		MoveTo(Land, 50.f);
		// Landed: on the ground again some time after leaving it.
		if (bFlag && Total - Mark > 0.35f && C->GetCharacterMovement()->IsMovingOnGround())
		{
			C->StopJumping();
			Check(C->GetActorLocation().X > WP(TEXT("WP_Cat4End")).X + 200.f, FString::Printf(TEXT("climax: jumped the second break (landed at x %.0f)"), C->GetActorLocation().X));
			Mark = Pos0.X;
			return true;
		}
		return false;
	}, 6.f});
	Steps.Add({TEXT("run 5"), []() {}, Walk(TEXT("WP_Cat5End"), 40.f), 6.f});
	Steps.Add({TEXT("tether A3"), [this]() { Stop(); }, [this, Tether](float T) {
		AimAt(Ring(TEXT("Ring_A3"))->GetAttachLocation());
		if (T < 0.15f) return false;
		if (Tether()->GetTarget() != Ring(TEXT("Ring_A3")))
		{
			return T > 1.0f;
		}
		Count0 = Tether()->ReelArrivals;
		Tether()->TryFire();
		return true;
	}, 3.f});
	Steps.Add({TEXT("onto the tower"), [this]() { bFlag = false; }, [this, Tether, GM](float T) {
		if (!bFlag && T > 0.78f)
		{
			// A long hitch two thirds of the way through the 1 s arc: the next frame (game time is
			// clamped to 0.4 s) carries the arc past its end. She must still land on the roof, not
			// stop in mid-air over the gap. (It adds about 0.4 s to the climax time.)
			bFlag = true;
			FPlatformProcess::Sleep(0.5f);
			bSkipFrameStat = true;
			Log(TEXT("a 0.5 s stall that ends the carry"));
		}
		if (T < 0.8f || !Char()->GetCharacterMovement()->IsMovingOnGround()) return false;
		Check(Tether()->ReelArrivals == Count0 + 1 && Char()->GetActorLocation().Z > 350.f, TEXT("climax: carried up onto the tower roof, despite the stall"));
		Log(FString::Printf(TEXT("climax run took %.1f s"), Total - Mark));
		return true;
	}, 6.f});
	Steps.Add({TEXT("final checkpoint"), []() {}, [this, GM](float T) {
		if (T < 1.0f) return false;
		Check(GM()->Checkpoint && GM()->Checkpoint->Order >= 4, TEXT("the tower roof checkpoint is reached"));
		return true;
	}});
	// The rooftop shot: skip it near its end.
	Steps.Add({TEXT("rooftop shot"), []() {}, [this, GM](float T) {
		UStormCinema* Cin = GM()->Cinema;
		if (!Cin->IsPlaying(EStormShot::Rooftop))
		{
			Check(Cin->Seen[static_cast<int32>(EStormShot::Rooftop)], TEXT("reaching the roof plays the rooftop shot"));
			return true;
		}
		if (FMath::IsNearlyEqual(Cin->GetTime(), 0.4f * Cin->GetLength(), 0.03f)) Shot(TEXT("12a_rooftop"));
		if (Cin->GetTime() < 0.9f * Cin->GetLength()) return false;
		Log(FString::Printf(TEXT("skipping the rooftop shot at %.1f of %.1f s"), Cin->GetTime(), Cin->GetLength()));
		Cin->Skip();
		return true;
	}, 12.f});
	Steps.Add({TEXT("rooftop shot ends"), []() {}, [this, GM](float T) {
		if (T < 0.6f) return false;
		CheckShotEnd(EStormShot::Rooftop, EShotEnd::Skipped, TEXT("the rooftop shot, skipped near its end"));
		Check(GM()->Music->GetMood() == EStormMood::Rooftop, TEXT("the rooftop's music"));
		return true;
	}});
	Steps.Add({TEXT("the view"), []() {}, [this](float T) {
		AimAt(WP(TEXT("WP_Lighthouse")) + FVector(0.f, -3000.f, -600.f));
		if (T < 0.6f) return false;
		Shot(TEXT("12_roof_view"));
		return true;
	}});

	// --- Beat 6: the note.
	Steps.Add({TEXT("to the note"), []() {}, Walk(TEXT("WP_Note"), 35.f), 10.f});
	Steps.Add({TEXT("read the note"), [this]() { Stop(); }, [this, GM](float T) {
		AimAt(WP(TEXT("WP_NoteTarget")));
		if (T < 0.4f) return false;
		Check(GM()->NoteInReach(Char()) != nullptr, TEXT("the note is in reach"));
		GM()->TryInteract(Char());
		return true;
	}});
	Steps.Add({TEXT("note open"), []() {}, [this, GM](float T) {
		if (T < 0.4f) return false;
		Check(GM()->OpenNote != nullptr && GM()->bComplete, TEXT("the note opens and the sequence is complete"));
		Shot(TEXT("13_ivos_note"));
		return true;
	}});
	Steps.Add({TEXT("close the note"), []() {}, [this, GM](float T) {
		if (T < 0.5f) return false;
		if (GM()->OpenNote)
		{
			GM()->TryInteract(Char());
			return false;
		}
		if (T < 1.0f) return false;
		Check(GM()->OpenNote == nullptr, TEXT("E closes the note"));
		Shot(TEXT("14_complete"));
		return true;
	}});

	// --- Cinematics again: a replay skipped at once grants nothing twice; a restart cuts one short.
	Steps.Add({TEXT("replay the opening, skip at once"), [this, GM]() { GM()->Cinema->Play(EStormShot::Opening, true); }, [this, GM](float T) {
		if (T < 0.15f) return false;
		if (GM()->Cinema->IsPlaying())
		{
			GM()->Cinema->Skip();
		}
		if (T < 0.8f) return false;
		CheckShotEnd(EStormShot::Opening, EShotEnd::Skipped, TEXT("the opening replayed and skipped at once"));
		return true;
	}});
	Steps.Add({TEXT("replay the reveal, restart"), [this, GM]() { bFlag = false; Count0 = GM()->Respawns; GM()->Cinema->Play(EStormShot::EngineReveal, true); }, [this, GM, Tether](float T) {
		if (!bFlag)
		{
			if (T < 1.5f) return false;
			bFlag = true;
			Mark = T;
			if (UEnhancedInputLocalPlayerSubsystem* Sub = PC()->GetLocalPlayer()->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
			{
				Sub->InjectInputForAction(Tether()->GetRestartAction(), FInputActionValue(true), {}, {});
			}
			return false;
		}
		if (T - Mark < 0.8f) return false;
		CheckShotEnd(EStormShot::EngineReveal, EShotEnd::Cancelled, TEXT("the reveal replayed and cut short by R"));
		Check(GM()->Respawns == Count0 + 1 && GM()->Music->Voices() <= 2, FString::Printf(TEXT("the restart happened; music voices %d (never more than two)"), GM()->Music->Voices()));
		return true;
	}});

	// --- Her face over the run, and where the sounds are heard.
	Steps.Add({TEXT("face and sound"), []() {}, [this](float T) {
		const UMaraFace* F = Char()->FindComponentByClass<UMaraFace>();
		auto Seen = [F](EMaraMood M) { return F && (F->MoodsSeen & (1 << static_cast<int32>(M))) != 0; };
		Check(F && F->Blinks >= 8, FString::Printf(TEXT("she blinks every few seconds (%d blinks)"), F ? F->Blinks : 0));
		Check(Seen(EMaraMood::Determined) && Seen(EMaraMood::Surprised) && Seen(EMaraMood::Happy), FString::Printf(TEXT("her face follows the game: determined %s, surprised %s, happy %s"),
			Seen(EMaraMood::Determined) ? TEXT("yes") : TEXT("no"), Seen(EMaraMood::Surprised) ? TEXT("yes") : TEXT("no"), Seen(EMaraMood::Happy) ? TEXT("yes") : TEXT("no")));
		const USoundBase* Step = Stormworks::SoundAsset(TEXT("SFX_Step_Stone_0"));
		const USoundBase* Chime = Stormworks::SoundAsset(TEXT("S_TOS_Chime_0"));
		const USoundBase* Wind = Stormworks::SoundAsset(TEXT("S_TOS_Wind"));
		Check(Step && Step->AttenuationSettings && Chime && Chime->AttenuationSettings && Wind && !Wind->AttenuationSettings,
			TEXT("sounds in the world fade with distance (steps, chimes); the wind and the music do not"));
		return true;
	}});

	// --- Her feet: one sound per plant, by surface, and the landings.
	Steps.Add({TEXT("footsteps"), []() {}, [this](float T) {
		const UMaraFootsteps* F = Char()->FindComponentByClass<UMaraFootsteps>();
		const UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(Char()->GetMesh()->GetAnimInstance());
		if (!F || !Anim)
		{
			Check(false, TEXT("Mara's footsteps component is there"));
			return true;
		}
		auto N = [F](const TCHAR* S) { const int32* V = F->StepsBySurface.Find(S); return V ? *V : 0; };
		Check(F->Steps > 30 && F->Steps == Anim->FootDowns + F->Landings, FString::Printf(TEXT("a footstep for each foot plant: %d steps, %d plants, %d landings"), F->Steps, Anim->FootDowns, F->Landings));
		Check(N(TEXT("stone")) > 0 && N(TEXT("metal")) > 0, FString::Printf(TEXT("footsteps follow the surface: stone %d, wood %d, metal %d"), N(TEXT("stone")), N(TEXT("wood")), N(TEXT("metal"))));
		Check(F->Landings > 0, FString::Printf(TEXT("landings make a sound (%d)"), F->Landings));
		return true;
	}});

	// --- After a dozen respawns, restarts and cinematics, no loops have piled up: the wind, the
	// alarm and the music's voices, nothing else.
	Steps.Add({TEXT("audio loops"), []() {}, [this](float T) {
		int32 Loops = 0, Playing = 0, Total = 0;
		FString Names;
		for (TObjectIterator<UAudioComponent> It; It; ++It)
		{
			// 2D sounds (the wind, the alarm, the music) belong to no actor and may report no world:
			// count every live audio component (there is only the one game world).
			if (It->IsTemplate() || !IsValid(*It))
			{
				continue;
			}
			++Total;
			if (!It->IsPlaying() || !It->Sound)
			{
				continue;
			}
			++Playing;
			const bool bLoop = It->Sound->IsLooping();
			Loops += bLoop ? 1 : 0;
			Names += It->Sound->GetName() + (bLoop ? TEXT("(loop) ") : TEXT(" "));
		}
		Log(FString::Printf(TEXT("audio components in the world: %d, playing %d: %s"), Total, Playing, *Names.TrimEnd()));
		Check(Loops >= 2 && Loops <= 4, FString::Printf(TEXT("looping sounds playing: %d (the wind and the music; the alarm fades 14 s after the engine wakes; nothing piled up)"), Loops));
		return true;
	}});

	// --- Restart from the checkpoint, and not stuck.
	// Through the real binding: R is mapped to the restart action, and the action is pressed.
	Steps.Add({TEXT("restart from checkpoint"), [this, Tether]() {
		const UInputAction* Restart = Tether()->GetRestartAction();
		bool bMapped = false;
		for (const FEnhancedActionKeyMapping& M : Tether()->GetMapping()->GetMappings())
		{
			bMapped |= M.Action == Restart && M.Key == EKeys::R;
		}
		Check(bMapped, TEXT("R is bound to restart from the checkpoint"));
		Count0 = GetWorld()->GetAuthGameMode<AStormworksGameMode>()->Respawns;
		bFlag = false;
	}, [this, GM, Tether](float T) {
		// Pressed a moment after the last screenshot, so its hitch is out of the way.
		if (!bFlag)
		{
			if (T < 0.3f) return false;
			if (UEnhancedInputLocalPlayerSubsystem* Sub = PC()->GetLocalPlayer()->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
			{
				Sub->InjectInputForAction(Tether()->GetRestartAction(), FInputActionValue(true), {}, {});
			}
			bFlag = true;
			Mark = T;
			return false;
		}
		if (GM()->Respawns == Count0 && T - Mark < 1.0f) return false;
		if (T - Mark < 0.5f) return false;
		const float Off = FVector::Dist(Char()->GetActorLocation(), GM()->Checkpoint->GetSpawnLocation());
		Check(GM()->Respawns == Count0 + 1 && Off < 150.f, FString::Printf(TEXT("pressing restart puts her at the last checkpoint (respawns +%d, %.0f cm from its spawn point)"), GM()->Respawns - Count0, Off));
		Pos0 = Char()->GetActorLocation();
		return true;
	}});
	Steps.Add({TEXT("not stuck"), []() {}, [this](float T) {
		// Toward the hut, not off the roof's open west edge.
		Char()->AddMovementInput((WP(TEXT("WP_Note")) - Char()->GetActorLocation()).GetSafeNormal2D(), 1.f);
		if (T < 1.0f) return false;
		Check(FVector::Dist2D(Char()->GetActorLocation(), Pos0) > 150.f, TEXT("at the end she can still walk about (not stuck)"));
		return true;
	}});
}

void AStormworksSelfTest::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Total += DeltaSeconds;
	if (QuitIn >= 0.f)
	{
		QuitIn -= DeltaSeconds;
		if (QuitIn < 0.f)
		{
			FPlatformMisc::RequestExit(false);
		}
		return;
	}
	if (bDone || !Char())
	{
		return;
	}
	// The first run compiles shaders; screenshots before that would show placeholder materials.
	if (Index < 0 && GShaderCompilingManager && GShaderCompilingManager->GetNumRemainingJobs() > 0)
	{
		ShaderWaitLog -= DeltaSeconds;
		if (ShaderWaitLog <= 0.f)
		{
			Log(FString::Printf(TEXT("waiting for %d shader jobs"), GShaderCompilingManager->GetNumRemainingJobs()));
			ShaderWaitLog = 15.f;
		}
		return;
	}
	if (Index >= 0)
	{
		++Frames;
		FrameSum += DeltaSeconds;
		FrameWorst = FMath::Max(FrameWorst, DeltaSeconds);
		FramesOver33 += DeltaSeconds > 0.0334f ? 1 : 0;
		if (bSkipFrameStat)
		{
			bSkipFrameStat = false;
		}
		else
		{
			const AStormworksGameMode* Mode = GetWorld()->GetAuthGameMode<AStormworksGameMode>();
			FFrameBucket& B = Mode && Mode->Cinema && Mode->Cinema->IsPlaying() ? Cinematics : Gameplay;
			++B.Frames;
			B.Over33 += DeltaSeconds > 0.0334f ? 1 : 0;
			B.Frame += DeltaSeconds * 1000.0;
			B.Game += FPlatformTime::ToMilliseconds(GGameThreadTime);
			B.Render += FPlatformTime::ToMilliseconds(GRenderThreadTime);
			B.Gpu += FPlatformTime::ToMilliseconds(RHIGetGPUFrameCycles(0));
		}
	}
	if (Index < 0)
	{
		Total = 0.f;
		Index = 0;
		StepT = 0.f;
		Log(FString::Printf(TEXT("-- %s"), *Steps[0].Name));
		Steps[0].Start();
	}
	FStep& S = Steps[Index];
	// -StormClip: frames of the opening and of the climax, by group (tools/unreal/make_clip.py).
	static const TMap<FString, FString> ClipSteps = {
		{TEXT("opening plays"), TEXT("opening")},
		{TEXT("run 1"), TEXT("climax")}, {TEXT("run 2"), TEXT("climax")}, {TEXT("tether A2"), TEXT("climax")}, {TEXT("across G1"), TEXT("climax")},
		{TEXT("run 3"), TEXT("climax")}, {TEXT("jump G2"), TEXT("climax")}, {TEXT("run 5"), TEXT("climax")}, {TEXT("tether A3"), TEXT("climax")},
		{TEXT("onto the tower"), TEXT("climax")}, {TEXT("final checkpoint"), TEXT("climax")},
	};
	// Saving a PNG takes about 0.25 s: game time runs at a quarter speed while the clip is taken,
	// so the game still steps at a normal rate between frames instead of playing at 4 fps.
	const FString* ClipGroup = bClip ? ClipSteps.Find(S.Name) : nullptr;
	if (bClip)
	{
		UGameplayStatics::SetGlobalTimeDilation(this, ClipGroup ? 0.25f : 1.f);
	}
	if (ClipGroup && Total >= ClipNext)
	{
		ClipNext = Total + 0.1f;
		FScreenshotRequest::RequestScreenshot(FPaths::Combine(OutDir, TEXT("clip"), FString::Printf(TEXT("%s_%04d.png"), **ClipGroup, ClipFrames++)), true, false);
	}
	const bool bFinished = S.Update(StepT);
	StepT += DeltaSeconds;
	if (!bFinished && StepT > S.Timeout)
	{
		Check(false, FString::Printf(TEXT("step \"%s\" timed out after %.0f s"), *S.Name, S.Timeout));
	}
	if (bFinished || StepT > S.Timeout)
	{
		++Index;
		StepT = 0.f;
		if (Index >= Steps.Num())
		{
			bDone = true;
			Log(BucketLine(TEXT("gameplay"), Gameplay));
			Log(BucketLine(TEXT("cinematics"), Cinematics));
			Log(FString::Printf(TEXT("frames: %d, mean %.1f ms (%.0f fps), worst %.1f ms, %d over 33 ms"), Frames, Frames ? 1000.f * FrameSum / Frames : 0.f, FrameSum > 0.f ? Frames / FrameSum : 0.f, FrameWorst * 1000.f, FramesOver33));
			Log(FString::Printf(TEXT("SELFTEST RESULT: %d passed, %d failed, %.1f s"), Passed, Failed, Total));
			QuitIn = 1.5f;
			return;
		}
		Log(FString::Printf(TEXT("-- %s"), *Steps[Index].Name));
		Steps[Index].Start();
	}
}
