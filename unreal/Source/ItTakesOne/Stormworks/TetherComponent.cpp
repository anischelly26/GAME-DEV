#include "Stormworks/TetherComponent.h"

#include "Camera/CameraComponent.h"
#include "Camera/PlayerCameraManager.h"
#include "CableComponent.h"
#include "Components/AudioComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "EngineUtils.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/LocalPlayer.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "ItTakesOne.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/TetherMovable.h"
#include "Stormworks/TetherPoint.h"

UTetherComponent::UTetherComponent()
{
	PrimaryComponentTick.bCanEverTick = true;
	PrimaryComponentTick.TickGroup = TG_PrePhysics;
}

ACharacter* UTetherComponent::GetCharacter() const
{
	return Cast<ACharacter>(GetOwner());
}

APlayerController* UTetherComponent::GetPC() const
{
	const ACharacter* C = GetCharacter();
	return C ? Cast<APlayerController>(C->GetController()) : nullptr;
}

FVector UTetherComponent::ChestLocation() const
{
	// About chest height for any capsule: 0.44 of the half-height above its centre.
	const ACharacter* C = GetCharacter();
	return GetOwner()->GetActorLocation() + FVector(0.f, 0.f, C ? C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() * 0.44f : 40.f);
}

FVector UTetherComponent::HandLocation() const
{
	if (const ACharacter* C = GetCharacter())
	{
		if (C->GetMesh() && C->GetMesh()->DoesSocketExist(TEXT("hand_r")))
		{
			return C->GetMesh()->GetSocketLocation(TEXT("hand_r"));
		}
	}
	return ChestLocation();
}

void UTetherComponent::BeginPlay()
{
	Super::BeginPlay();

	ACharacter* C = GetCharacter();
	if (!C)
	{
		return;
	}
	Camera = C->FindComponentByClass<UCameraComponent>();
	// The carry sets her velocity for this frame's length, so her movement must run after it in the
	// same frame. Otherwise, after a long frame, the last short frame's velocity is applied for the
	// whole long one and she overshoots the landing.
	if (UCharacterMovementComponent* MC = C->GetCharacterMovement())
	{
		MC->PrimaryComponentTick.AddPrerequisite(this, PrimaryComponentTick);
	}

	Cable = NewObject<UCableComponent>(C, TEXT("TetherCable"));
	if (C->GetMesh() && C->GetMesh()->DoesSocketExist(TEXT("hand_r")))
	{
		Cable->SetupAttachment(C->GetMesh(), TEXT("hand_r"));
	}
	else
	{
		Cable->SetupAttachment(C->GetRootComponent());
	}
	Cable->CableWidth = 2.6f;
	Cable->NumSegments = 12;
	Cable->NumSides = 6;
	Cable->SolverIterations = 4;
	Cable->bAttachEnd = true;
	Cable->bEnableStiffness = true;
	Cable->CableGravityScale = 0.6f;
	Cable->SetCastShadow(false);
	Cable->RegisterComponent();
	Cable->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Cable")));
	Cable->SetVisibility(false);

	SetupInput();
}

void UTetherComponent::SetupInput()
{
	APlayerController* PC = GetPC();
	if (!PC || bInputBound)
	{
		return;
	}
	FireAction = NewObject<UInputAction>(this, TEXT("IA_Tether"));
	ReleaseAction = NewObject<UInputAction>(this, TEXT("IA_TetherRelease"));
	RestartAction = NewObject<UInputAction>(this, TEXT("IA_RestartCheckpoint"));
	SkipAction = NewObject<UInputAction>(this, TEXT("IA_SkipCinematic"));
	Mapping = NewObject<UInputMappingContext>(this, TEXT("IMC_Tether"));
	Mapping->MapKey(FireAction, EKeys::E);
	Mapping->MapKey(FireAction, EKeys::LeftMouseButton);
	Mapping->MapKey(FireAction, EKeys::Gamepad_RightTrigger);
	Mapping->MapKey(ReleaseAction, EKeys::SpaceBar);
	Mapping->MapKey(ReleaseAction, EKeys::Gamepad_FaceButton_Bottom);
	Mapping->MapKey(RestartAction, EKeys::R);
	Mapping->MapKey(RestartAction, EKeys::Gamepad_Special_Left);
	// Skipping a cinematic (E skips too, through OnFirePressed).
	Mapping->MapKey(SkipAction, EKeys::SpaceBar);
	Mapping->MapKey(SkipAction, EKeys::Enter);
	Mapping->MapKey(SkipAction, EKeys::Gamepad_FaceButton_Bottom);
	Mapping->MapKey(SkipAction, EKeys::Gamepad_FaceButton_Right);

	if (ULocalPlayer* LP = PC->GetLocalPlayer())
	{
		if (UEnhancedInputLocalPlayerSubsystem* Sub = LP->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>())
		{
			Sub->AddMappingContext(Mapping, 2);
		}
	}
	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PC->InputComponent))
	{
		EIC->BindAction(FireAction, ETriggerEvent::Started, this, &UTetherComponent::OnFirePressed);
		EIC->BindAction(ReleaseAction, ETriggerEvent::Started, this, &UTetherComponent::OnReleasePressed);
		EIC->BindAction(RestartAction, ETriggerEvent::Started, this, &UTetherComponent::OnRestartPressed);
		EIC->BindAction(SkipAction, ETriggerEvent::Started, this, &UTetherComponent::OnSkipPressed);
		bInputBound = true;
	}
	else
	{
		UE_LOG(LogStormworks, Warning, TEXT("Tether: the player controller has no Enhanced Input component; the tether cannot be bound."));
	}
}

void UTetherComponent::OnSkipPressed()
{
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		GM->Cinema->Skip();
	}
}

void UTetherComponent::OnFirePressed()
{
	// Reading notes shares the button: a note in front of her wins. During a cinematic it skips.
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		if (GM->Cinema->IsPlaying())
		{
			GM->Cinema->Skip();
			return;
		}
		if (GM->TryInteract(GetCharacter()))
		{
			return;
		}
	}
	TryFire();
}

void UTetherComponent::OnReleasePressed()
{
	if (State == ETetherState::Reeling)
	{
		Release(true);
	}
}

void UTetherComponent::OnRestartPressed()
{
	// Stuck or unhappy with a run: back to the last checkpoint.
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		GM->StormRestart();
	}
}

void UTetherComponent::GiveTether()
{
	bHasTether = true;
}

void UTetherComponent::SetState(ETetherState NewState)
{
	State = NewState;
	StateT = 0.f;
}

bool UTetherComponent::TryFire()
{
	if (!bHasTether || State != ETetherState::Idle)
	{
		return false;
	}
	ATetherPoint* Point = Target.Get();
	if (!Point)
	{
		if (ATetherPoint* Far = FarTarget.Get())
		{
			++TooFar;
			Far->Pulse(0.4f);
			Refuse(FVector::ZeroVector, 0.6f);
			if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
			{
				GM->ShowMessage(TEXT("Too far: get closer to the ring"), 1.6f);
			}
		}
		return false;
	}
	Attached = Point;
	CableEnd = HandLocation();
	++Fires;
	SetState(ETetherState::Shooting);
	Point->SetHighlight(3);
	// Accepted: the mechanical release (a recorded click under the synthesised whip of the hook).
	Stormworks::Sound(this, TEXT("SFX_Click"), HandLocation(), 0.7f, FMath::FRandRange(0.95f, 1.08f));
	Stormworks::Sound(this, TEXT("S_TOS_Fire"), HandLocation(), 0.7f, FMath::FRandRange(0.95f, 1.08f));
	return true;
}

void UTetherComponent::Latch()
{
	ATetherPoint* Point = Attached.Get();
	if (!Point)
	{
		SetState(ETetherState::Retracting);
		RetractFrom = CableEnd;
		return;
	}
	Point->Pulse(1.f);
	AddShake(0.25f);
	// Attached: a firm catch, only now that it has really caught.
	LastLatchVariant = Stormworks::Variant(5, LastLatchVariant);
	Stormworks::Sound(this, TEXT("SFX_Latch"), Point->GetAttachLocation(), 0.9f, FMath::FRandRange(0.95f, 1.05f));
	Stormworks::Sound(this, *FString::Printf(TEXT("SFX_MetalLight_%d"), LastLatchVariant), Point->GetAttachLocation(), 0.6f, FMath::FRandRange(0.95f, 1.05f));
	Stormworks::Sound(this, TEXT("S_TOS_Latch"), Point->GetAttachLocation(), 0.5f, FMath::FRandRange(0.95f, 1.05f));

	if (Point->Kind == ETetherPointKind::Pull)
	{
		ATetherMovable* M = Point->Movable;
		if (M && M->Tug())
		{
			++Pulls;
			SetState(ETetherState::Pulling);
			// Leaning into the pull: she walks slowly while the machine runs.
			if (UCharacterMovementComponent* MC = GetCharacter()->GetCharacterMovement())
			{
				SavedWalkSpeed = MC->MaxWalkSpeed;
				MC->MaxWalkSpeed = SavedWalkSpeed * 0.3f;
				bMovementBorrowed = true;
			}
			AddShake(0.2f);
		}
		else
		{
			// Already engaged, or still moving: a twang, and the hook comes back.
			++Refusals;
			Refuse(Point->GetAttachLocation(), 0.8f);
			RetractFrom = Point->GetAttachLocation();
			SetState(ETetherState::Retracting);
		}
		return;
	}
	BeginReel(Point);
}

void UTetherComponent::BeginReel(ATetherPoint* Point)
{
	ACharacter* C = GetCharacter();
	UCharacterMovementComponent* MC = C ? C->GetCharacterMovement() : nullptr;
	if (!MC)
	{
		return;
	}
	const float Half = C->GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
	ReelFrom = C->GetActorLocation();
	// Aim half a metre above the landing: she drops onto it rather than skimming the edge on the way.
	ReelTo = Point->GetLandingLocation() + FVector(0.f, 0.f, Half + 50.f);
	const float Dist = FVector::Dist(ReelFrom, ReelTo);
	// An arc that rises above both ends: the cable swings her up and over.
	const FVector Mid = (ReelFrom + ReelTo) * 0.5f;
	const float Lift = FMath::Max(140.f, Dist * 0.22f) + FMath::Max(0.f, ReelTo.Z - ReelFrom.Z) * 0.4f;
	ReelControl = Mid + FVector(0.f, 0.f, Lift);
	ReelDuration = FMath::Clamp(Dist / ReelSpeed, 0.55f, 1.5f);
	Blocked = 0.f;
	ReelLast = ReelFrom;

	SavedAirControl = MC->AirControl;
	SavedGravity = MC->GravityScale;
	MC->AirControl = 0.f;
	MC->GravityScale = 0.f;
	MC->SetMovementMode(MOVE_Falling);
	bMovementBorrowed = true;

	++Reels;
	SetState(ETetherState::Reeling);
	AddShake(0.35f);
	// The travel: the cable's tension, riding along with her (one per carry).
	StopReelAudio(0.f);
	ReelAudio = Stormworks::SoundAttached(C->GetRootComponent(), TEXT("S_TOS_Reel"), 0.9f);
	UE_LOG(LogStormworks, Log, TEXT("Tether: carried to %s, %.0f cm over %.2f s"), *Point->GetName(), Dist, ReelDuration);
}

void UTetherComponent::TickReel(float DeltaTime)
{
	ACharacter* C = GetCharacter();
	UCharacterMovementComponent* MC = C ? C->GetCharacterMovement() : nullptr;
	if (!MC)
	{
		return;
	}
	if (StateT > 0.08f && MC->MovementMode != MOVE_Falling)
	{
		// She touched down before the end (a ledge on the way): that counts if she is close.
		const AActor* On = MC->CurrentFloor.HitResult.GetActor();
		UE_LOG(LogStormworks, Log, TEXT("Tether: touched down early at %s on %s"), *C->GetActorLocation().ToCompactString(), On ? *On->GetActorNameOrLabel() : TEXT("nothing"));
		EndReel(FVector::Dist2D(C->GetActorLocation(), ReelTo) < 250.f, false);
		return;
	}
	const float U = FMath::Clamp((StateT + DeltaTime) / ReelDuration, 0.f, 1.f);
	const float E = U * U * (3.f - 2.f * U);
	const FVector A = FMath::Lerp(ReelFrom, ReelControl, E);
	const FVector B = FMath::Lerp(ReelControl, ReelTo, E);
	const FVector Want = FMath::Lerp(A, B, E);
	const FVector Now = C->GetActorLocation();
	MC->Velocity = (Want - Now) / FMath::Max(DeltaTime, 1e-3f);

	// Something in the way (a beam overhead): after a moment, let go rather than grind into it.
	// Measured against where the last frame sent her, not where this one will, so the frame's own
	// travel (up to a metre at full speed) is not mistaken for being held back. A long frame
	// (loading a sound, compiling a shader, a screenshot) does not count either way.
	if (DeltaTime < 0.05f)
	{
		Blocked = FVector::Dist(Now, ReelLast) > 120.f ? Blocked + DeltaTime : 0.f;
	}
	ReelLast = Want;
	if (Blocked > 0.2f)
	{
		EndReel(false, false);
		return;
	}
	if (U >= 1.f)
	{
		// The end of the arc. Move her the rest of the way now: the set-down velocity EndReel gives
		// her replaces this frame's, and after a long frame the rest of the way can be metres.
		FHitResult Hit;
		MC->SafeMoveUpdatedComponent(Want - Now, C->GetActorQuat(), true, Hit);
		EndReel(FVector::Dist(C->GetActorLocation(), ReelTo) < 80.f, false);
	}
}

void UTetherComponent::EndReel(bool bArrived, bool bKeepMomentum)
{
	ACharacter* C = GetCharacter();
	UCharacterMovementComponent* MC = C ? C->GetCharacterMovement() : nullptr;
	if (C)
	{
		UE_LOG(LogStormworks, Log, TEXT("Tether: carry ends after %.2f of %.2f s, %.0f cm from the landing (%s)"), StateT, ReelDuration, FVector::Dist(C->GetActorLocation(), ReelTo), bArrived ? TEXT("arrived") : (bKeepMomentum ? TEXT("let go") : TEXT("stopped")));
	}
	StopReelAudio(0.12f);
	RestoreMovement();
	if (MC)
	{
		if (bArrived)
		{
			// Set down gently, still moving a little the way she flew.
			const FVector Flat = FVector(ReelTo.X - ReelFrom.X, ReelTo.Y - ReelFrom.Y, 0.f).GetSafeNormal();
			MC->Velocity = Flat * 220.f + FVector(0.f, 0.f, -150.f);
			++ReelArrivals;
			Stormworks::Sound(this, TEXT("S_TOS_Land"), C->GetActorLocation(), 0.8f);
		}
		else if (!bKeepMomentum)
		{
			MC->Velocity *= 0.35f;
		}
	}
	if (ATetherPoint* P = Attached.Get())
	{
		RetractFrom = P->GetAttachLocation();
	}
	SetState(ETetherState::Retracting);
}

void UTetherComponent::RestoreMovement()
{
	if (!bMovementBorrowed)
	{
		return;
	}
	if (ACharacter* C = GetCharacter())
	{
		if (UCharacterMovementComponent* MC = C->GetCharacterMovement())
		{
			if (State == ETetherState::Reeling)
			{
				MC->AirControl = SavedAirControl;
				MC->GravityScale = SavedGravity;
			}
			else
			{
				MC->MaxWalkSpeed = SavedWalkSpeed;
			}
		}
	}
	bMovementBorrowed = false;
}

void UTetherComponent::Release(bool bKeepMomentum)
{
	if (State == ETetherState::Reeling)
	{
		EndReel(false, bKeepMomentum);
	}
	else if (State == ETetherState::Pulling || State == ETetherState::Shooting)
	{
		RestoreMovement();
		RetractFrom = CableEnd;
		SetState(ETetherState::Retracting);
	}
}

void UTetherComponent::Refuse(const FVector& At, float Volume)
{
	const double Now = GetWorld()->GetTimeSeconds();
	if (Now - LastRefuseTime < 0.35)
	{
		return;
	}
	LastRefuseTime = Now;
	if (At.IsZero())
	{
		Stormworks::Sound2D(this, TEXT("S_TOS_Refuse"), Volume);
	}
	else
	{
		Stormworks::Sound(this, TEXT("S_TOS_Refuse"), At, Volume);
	}
}

void UTetherComponent::StopReelAudio(float FadeTime)
{
	if (ReelAudio)
	{
		if (FadeTime > 0.f)
		{
			ReelAudio->FadeOut(FadeTime, 0.f);
		}
		else
		{
			ReelAudio->Stop();
		}
		ReelAudio = nullptr;
	}
}

void UTetherComponent::ResetTether()
{
	StopReelAudio(0.f);
	RestoreMovement();
	if (ATetherPoint* P = Attached.Get())
	{
		P->SetHighlight(0);
	}
	Attached = nullptr;
	SetState(ETetherState::Idle);
	if (Cable)
	{
		Cable->SetVisibility(false);
	}
}

void UTetherComponent::UpdateTargeting()
{
	ATetherPoint* OldTarget = Target.Get();
	ATetherPoint* OldFar = FarTarget.Get();
	ATetherPoint* Best = nullptr;
	ATetherPoint* BestFar = nullptr;

	APlayerController* PC = GetPC();
	if (bHasTether && PC && PC->PlayerCameraManager && State == ETetherState::Idle)
	{
		const FVector CamLoc = PC->PlayerCameraManager->GetCameraLocation();
		const FVector CamDir = PC->PlayerCameraManager->GetCameraRotation().Vector();
		const FVector Chest = ChestLocation();
		const float CosCone = FMath::Cos(FMath::DegreesToRadians(AimConeDegrees));
		// The ring nearest the aim wins, in reach or not: what you aim at is what you get. If it is
		// out of reach, the HUD says so rather than quietly picking another ring nearby.
		float BestScore = TNumericLimits<float>::Max();
		ATetherPoint* Aimed = nullptr;
		float AimedDist = 0.f;

		FCollisionQueryParams Params(SCENE_QUERY_STAT(TetherSight), false, GetOwner());
		for (TActorIterator<ATetherPoint> It(GetWorld()); It; ++It)
		{
			ATetherPoint* P = *It;
			if (!P->bEnabled)
			{
				continue;
			}
			const FVector Loc = P->GetAttachLocation();
			const FVector ToP = (Loc - CamLoc).GetSafeNormal();
			const float Cos = FVector::DotProduct(CamDir, ToP);
			if (Cos < CosCone)
			{
				continue;
			}
			const float Dist = FVector::Dist(Chest, Loc);
			// Nothing solid between her and the ring (the ring's own machine does not count).
			FCollisionQueryParams Q = Params;
			Q.AddIgnoredActor(P);
			if (P->Movable)
			{
				Q.AddIgnoredActor(P->Movable);
			}
			FHitResult Hit;
			if (GetWorld()->LineTraceSingleByChannel(Hit, Chest, Loc, ECC_Visibility, Q))
			{
				continue;
			}
			if (Dist > Range * 2.5f)
			{
				continue;
			}
			const float Angle = FMath::RadiansToDegrees(FMath::Acos(FMath::Clamp(Cos, -1.f, 1.f)));
			const float Score = Angle + Dist * 0.004f;
			if (Score < BestScore)
			{
				BestScore = Score;
				Aimed = P;
				AimedDist = Dist;
			}
		}
		if (Aimed)
		{
			(AimedDist <= Range ? Best : BestFar) = Aimed;
		}
	}

	for (ATetherPoint* P : {OldTarget, OldFar})
	{
		if (P && P != Best && P != BestFar && P != Attached.Get())
		{
			P->SetHighlight(0);
		}
	}
	if (Best)
	{
		Best->SetHighlight(2);
	}
	if (BestFar)
	{
		BestFar->SetHighlight(1);
	}
	Target = Best;
	FarTarget = BestFar;
}

void UTetherComponent::UpdateCable(float DeltaTime)
{
	if (!Cable)
	{
		return;
	}
	const bool bShow = State != ETetherState::Idle;
	Cable->SetVisibility(bShow);
	if (!bShow)
	{
		return;
	}
	ATetherPoint* P = Attached.Get();
	const FVector Hand = HandLocation();
	FVector End = Hand;
	float Slack = 0.97f;
	switch (State)
	{
	case ETetherState::Shooting:
		if (P)
		{
			const float K = FMath::Clamp(StateT / ShootTime, 0.f, 1.f);
			End = FMath::Lerp(Hand, P->GetAttachLocation(), K);
			Slack = 1.08f;
		}
		break;
	case ETetherState::Pulling:
	case ETetherState::Reeling:
		End = P ? P->GetAttachLocation() : Hand;
		// Taut, with a tremor of tension.
		Slack = 0.96f + 0.01f * FMath::Sin(Time * 47.f);
		break;
	case ETetherState::Retracting:
		End = FMath::Lerp(RetractFrom, Hand, FMath::Clamp(StateT / 0.16f, 0.f, 1.f));
		Slack = 1.15f;
		break;
	default:
		break;
	}
	CableEnd = End;
	Cable->EndLocation = Cable->GetComponentTransform().InverseTransformPosition(End);
	Cable->CableLength = FMath::Max(5.f, FVector::Dist(Hand, End) * Slack);
}

void UTetherComponent::AddShake(float Amount)
{
	Trauma = FMath::Clamp(Trauma + Amount, 0.f, 1.f);
}

void UTetherComponent::UpdateShake(float DeltaTime)
{
	UCameraComponent* Cam = Camera.Get();
	if (!Cam)
	{
		return;
	}
	if (!bCameraBaseSet)
	{
		CameraBase = Cam->GetRelativeLocation();
		bCameraBaseSet = true;
	}
	Trauma = FMath::Max(0.f, Trauma - DeltaTime * 2.2f);
	const float S = Trauma * Trauma * 9.f;
	const FVector Offset(
		0.f,
		S * FMath::PerlinNoise1D(Time * 23.f),
		S * FMath::PerlinNoise1D(Time * 29.f + 7.f));
	Cam->SetRelativeLocation(CameraBase + Offset);
}

void UTetherComponent::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	Time += DeltaTime;
	if (!bInputBound)
	{
		SetupInput();
	}

	switch (State)
	{
	case ETetherState::Shooting:
		if (StateT >= ShootTime)
		{
			Latch();
		}
		break;
	case ETetherState::Pulling:
	{
		ATetherPoint* P = Attached.Get();
		ATetherMovable* M = P ? P->Movable.Get() : nullptr;
		const bool bTooFar = P && FVector::Dist(ChestLocation(), P->GetAttachLocation()) > Range * 1.4f;
		if (!M || !M->IsMoving() || bTooFar)
		{
			RestoreMovement();
			RetractFrom = P ? P->GetAttachLocation() : CableEnd;
			SetState(ETetherState::Retracting);
			AddShake(0.15f);
		}
		break;
	}
	case ETetherState::Reeling:
		TickReel(DeltaTime);
		break;
	case ETetherState::Retracting:
		if (StateT >= 0.16f)
		{
			if (ATetherPoint* P = Attached.Get())
			{
				P->SetHighlight(0);
			}
			Attached = nullptr;
			SetState(ETetherState::Idle);
		}
		break;
	default:
		break;
	}
	StateT += DeltaTime;

	UpdateTargeting();
	UpdateCable(DeltaTime);
	UpdateShake(DeltaTime);
}
