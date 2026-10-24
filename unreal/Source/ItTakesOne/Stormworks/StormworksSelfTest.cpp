#include "Stormworks/StormworksSelfTest.h"

#include "Camera/PlayerCameraManager.h"
#include "EngineUtils.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "Engine/TargetPoint.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformMisc.h"
#include "HAL/PlatformProcess.h"
#include "InputMappingContext.h"
#include "Kismet/GameplayStatics.h"
#include "ItTakesOne.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Stormworks/CollapsingWalkway.h"
#include "Stormworks/StormCheckpoint.h"
#include "Stormworks/StormDirector.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/StoryNote.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/TetherMovable.h"
#include "Stormworks/TetherPickup.h"
#include "Stormworks/TetherPoint.h"
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
	Steps.Add({TEXT("no tether yet"), [this, Tether]() { Count0 = Tether()->Fires; Tether()->TryFire(); }, [this, Tether](float T) {
		if (T < 0.3f) return false;
		Check(Tether()->Fires == Count0, TEXT("before the pickup, Tether does nothing"));
		return true;
	}});

	// --- Beat 2: learn safely.
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
	Steps.Add({TEXT("onto the tower"), []() {}, [this, Tether, GM](float T) {
		if (T < 0.8f || !Char()->GetCharacterMovement()->IsMovingOnGround()) return false;
		Check(Tether()->ReelArrivals == Count0 + 1 && Char()->GetActorLocation().Z > 350.f, TEXT("climax: carried up onto the tower roof"));
		Log(FString::Printf(TEXT("climax run took %.1f s"), Total - Mark));
		return true;
	}, 6.f});
	Steps.Add({TEXT("final checkpoint"), []() {}, [this, GM](float T) {
		if (T < 1.0f) return false;
		Check(GM()->Checkpoint && GM()->Checkpoint->Order >= 4, TEXT("the tower roof checkpoint is reached"));
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
	static const TSet<FString> ClipSteps = {TEXT("run 1"), TEXT("run 2"), TEXT("tether A2"), TEXT("across G1"), TEXT("run 3"), TEXT("jump G2"), TEXT("run 5"), TEXT("tether A3"), TEXT("onto the tower"), TEXT("final checkpoint"), TEXT("the view")};
	// Saving a PNG takes about 0.25 s: game time runs at a quarter speed while the clip is taken,
	// so the game still steps at a normal rate between frames instead of playing at 4 fps.
	const bool bClipping = bClip && Passed > 20 && ClipSteps.Contains(S.Name);
	if (bClip)
	{
		UGameplayStatics::SetGlobalTimeDilation(this, bClipping ? 0.25f : 1.f);
	}
	if (bClipping && Total >= ClipNext)
	{
		ClipNext = Total + 0.1f;
		FScreenshotRequest::RequestScreenshot(FPaths::Combine(OutDir, TEXT("clip"), FString::Printf(TEXT("frame_%04d.png"), ClipFrames++)), true, false);
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
			Log(FString::Printf(TEXT("frames: %d, mean %.1f ms (%.0f fps), worst %.1f ms, %d over 33 ms"), Frames, Frames ? 1000.f * FrameSum / Frames : 0.f, FrameSum > 0.f ? Frames / FrameSum : 0.f, FrameWorst * 1000.f, FramesOver33));
			Log(FString::Printf(TEXT("SELFTEST RESULT: %d passed, %d failed, %.1f s"), Passed, Failed, Total));
			QuitIn = 1.5f;
			return;
		}
		Log(FString::Printf(TEXT("-- %s"), *Steps[Index].Name));
		Steps[Index].Start();
	}
}
