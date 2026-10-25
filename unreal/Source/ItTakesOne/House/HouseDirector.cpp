#include "House/HouseDirector.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/AudioComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/SpotLightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PointLight.h"
#include "Engine/PostProcessVolume.h"
#include "Engine/SpotLight.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PhysicsVolume.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/SpringArmComponent.h"
#include "House/DescentRide.h"
#include "House/HouseDetail.h"
#include "House/HouseGameMode.h"
#include "House/HouseReflection.h"
#include "House/NacreTentacle.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "Stormworks/MaraAnimInstance.h"
#include "Stormworks/MaraCharacter.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormEase.h"
#include "Stormworks/StormRain.h"
#include "Stormworks/StormworksAssets.h"
#include "TimerManager.h"

namespace
{
	const TCHAR* BeatName(EHouseBeat B)
	{
		static const TCHAR* Names[] = {TEXT("outside"), TEXT("inside"), TEXT("inspected"), TEXT("stolen"), TEXT("teacup"), TEXT("retreat"), TEXT("lamp"),
			TEXT("searchlight"), TEXT("grab"), TEXT("descent"), TEXT("reveal"), TEXT("returned")};
		return Names[static_cast<int32>(B)];
	}

	UAudioComponent* Loop2D(UObject* Context, const TCHAR* Name, float Volume)
	{
		USoundBase* S = Stormworks::SoundAsset(Name);
		return S ? UGameplayStatics::SpawnSound2D(Context, S, Volume, 1.f, 0.f, nullptr, true, false) : nullptr;
	}

	void SetVolume(UAudioComponent* A, float V)
	{
		if (A)
		{
			A->SetVolumeMultiplier(FMath::Max(V, 0.001f));
		}
	}
}

AHouseDirector::AHouseDirector()
{
	PrimaryActorTick.bCanEverTick = true;
}

AMaraCharacter* AHouseDirector::Mara() const
{
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	return PC ? Cast<AMaraCharacter>(PC->GetPawn()) : nullptr;
}

AHouseGameMode* AHouseDirector::Mode() const
{
	return GetWorld()->GetAuthGameMode<AHouseGameMode>();
}

void AHouseDirector::BeginPlay()
{
	Super::BeginPlay();
	Storm = Loop2D(this, TEXT("S_TOS_Wind"), 0.7f);
	if (Storm)
	{
		Storm->SetLowPassFilterEnabled(true);
		Storm->SetLowPassFilterFrequency(20000.f);
	}
	Room = Loop2D(this, TEXT("H_RoomTone"), 0.05f);
	Hum = Loop2D(this, TEXT("H_MotifLow"), 0.3f);
	Deep = Loop2D(this, TEXT("H_Underwater"), 0.001f);
	Heart = Loop2D(this, TEXT("H_Heartbeat"), 0.001f);
	if (StormKey)
	{
		KeyBase = StormKey->GetLightComponent()->Intensity;
	}
	if (Fog)
	{
		FogDensity = Fog->GetComponent()->FogDensity;
		FogColour = Fog->GetComponent()->FogInscatteringLuminance;
	}
	if (HallDoor)
	{
		HallDoorBase = HallDoor->GetActorTransform();
	}
	if (NacreBody)
	{
		// Where each resting arm's tip lies from the body: the arms trail it the same way when it moves.
		for (ANacreTentacle* A : Arms)
		{
			ArmOffsets.Add(A ? A->InitialTip - NacreBody->GetActorLocation() : FVector::ZeroVector);
		}
	}
	for (AActor* R : Rattles)
	{
		RattleBase.Add(R ? R->GetActorTransform() : FTransform::Identity);
	}
	for (APointLight* L : HouseLamps)
	{
		LampBase.Add(L ? L->PointLightComponent->Intensity : 0.f);
	}
	if (Searchlight)
	{
		Searchlight->SpotLightComponent->SetIntensity(0.f);
	}
	if (Seeds)
	{
		Seeds->SetActorHiddenInGame(true);
	}
	if (Underwater)
	{
		Underwater->BlendWeight = 0.f;
	}
	if (Tentacle)
	{
		Tentacle->MoveBase(SinkDrain, FRotator::ZeroRotator);
		Tentacle->SnapTip(SinkDrain);
	}
	for (ANacreTentacle* B : Burst)
	{
		if (B)
		{
			B->SnapTip(B->GetActorLocation());
		}
	}
	if (Ride)
	{
		Ride->OnFinished.AddUObject(this, &AHouseDirector::StartReveal);
	}
}

void AHouseDirector::SetBeat(EHouseBeat NewBeat)
{
	Beat = NewBeat;
	BeatTime = 0.f;
	UE_LOG(LogStormworks, Log, TEXT("House: %s"), BeatName(NewBeat));
}

bool AHouseDirector::IsGaugeInReach() const
{
	const AMaraCharacter* M = Mara();
	return M && Gauge && !Gauge->IsHidden() && FVector::Dist2D(M->GetActorLocation(), Gauge->GetActorLocation()) < 200.f
		&& Gauge->IsLookedAtBy(GetWorld()->GetFirstPlayerController(), 40.f);
}

bool AHouseDirector::IsOfferInReach() const
{
	const AMaraCharacter* M = Mara();
	return M && Offer && Offer->IsOut() && FVector::Dist(M->GetActorLocation(), Offer->GetTip()) < 240.f;
}

bool AHouseDirector::IsTentacleLookedAt() const
{
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!Tentacle || Tentacle->IsIn() || !PC || !PC->PlayerCameraManager)
	{
		return false;
	}
	const FVector Cam = PC->PlayerCameraManager->GetCameraLocation();
	const FVector To = Tentacle->GetTip() - Cam;
	return To.Size() < 1100.f && FVector::DotProduct(PC->PlayerCameraManager->GetCameraRotation().Vector(), To.GetSafeNormal()) > FMath::Cos(FMath::DegreesToRadians(22.f));
}

void AHouseDirector::Interact()
{
	AMaraCharacter* M = Mara();
	AHouseGameMode* GM = Mode();
	if (!M || !GM)
	{
		return;
	}
	UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(M->GetMesh()->GetAnimInstance());
	if (Beat == EHouseBeat::Inside && IsGaugeInReach())
	{
		// Ivo's gauge, where he always left it. Its needle wakes and points at the floor.
		Gauge->TwitchNeedle();
		if (Anim)
		{
			Anim->PlayAction(TEXT("interact"), 1.2f, 0.3f, 0.9f, true);
		}
		Stormworks::Sound(this, TEXT("SFX_Click"), Gauge->GetActorLocation(), 0.5f, 1.3f);
		GM->ShowMessage(TEXT("He kept it."), 3.f);
		GM->SetObjective(TEXT("Look around"));
		SetBeat(EHouseBeat::Inspected);
	}
	else if (Beat == EHouseBeat::Reveal && IsOfferInReach())
	{
		// She takes it back. Nacre flushes coral and looks away; three taps on the glass.
		Offer->Release();
		Gauge->AttachToComponent(M->GetMesh(), FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("hand_r"));
		Offer->SetTint(ENacreTint::Coral);
		Offer->SetCurl(0.f);
		Offer->SetTipTarget(Offer->GetTip() + FVector(0.f, 160.f, 60.f));
		if (Anim)
		{
			Anim->PlayAction(TEXT("pickup"), 1.2f, 0.f, -1.f, true);
		}
		GM->ShowMessage(TEXT("...You could have asked."), 4.f);
		GM->SetObjective(TEXT(""));
		for (int32 i = 0; i < 3; ++i)
		{
			FTimerHandle H;
			GetWorldTimerManager().SetTimer(H, FTimerDelegate::CreateWeakLambda(this, [this, i]()
			{
				if (Offer)
				{
					Stormworks::Sound(this, *FString::Printf(TEXT("SFX_Glass_%d"), i), Offer->GetActorLocation(), 0.8f, 1.1f);
				}
				++Taps;
			}), 0.9f + 0.32f * i, false);
		}
		SetBeat(EHouseBeat::Returned);
	}
}

void AHouseDirector::OnShotDone(EStormShot Shot)
{
	if (Shot == EStormShot::HouseGrab && Beat == EHouseBeat::Grab)
	{
		StartDescent();
	}
}

void AHouseDirector::StartDescent()
{
	AMaraCharacter* M = Mara();
	if (!M)
	{
		return;
	}
	M->SetBubble(true);
	M->SetActorLocation(HallStart, false, nullptr, ETeleportType::TeleportPhysics);
	for (ANacreTentacle* B : Burst)
	{
		if (B)
		{
			B->SetOut(false, 0.5f);
		}
	}
	if (Tentacle)
	{
		// The gauge goes with Nacre; it comes back in the reveal.
		Tentacle->Release();
		Tentacle->SetOut(false, 0.4f);
	}
	if (Gauge)
	{
		Gauge->SetActorHiddenInGame(true);
	}
	TickShake(false);
	SetBeat(EHouseBeat::Descent);
	if (Ride)
	{
		Ride->Begin(M);
	}
	else
	{
		StartReveal();
	}
}

void AHouseDirector::StartReveal()
{
	AMaraCharacter* M = Mara();
	if (!M)
	{
		return;
	}
	// From here she swims: the world's default physics volume becomes water (the reveal is the last
	// space of the slice, and it is all under water).
	GetWorld()->GetDefaultPhysicsVolume()->bWaterVolume = true;
	M->SetActorLocation(RevealEntry, false, nullptr, ETeleportType::TeleportPhysics);
	M->GetCharacterMovement()->Velocity = FVector::ZeroVector;
	M->GetCharacterMovement()->SetMovementMode(MOVE_Swimming);
	if (APlayerController* PC = Cast<APlayerController>(M->GetController()))
	{
		// The first view: into the room, a little short of the largest lantern (the pull finishes it).
		const FVector Toward = (RevealLookAt ? RevealLookAt->GetActorLocation() : OfferSpot) - RevealEntry;
		PC->SetControlRotation(FRotator(-4.f, Toward.Rotation().Yaw - 20.f, 0.f));
		if (PC->PlayerCameraManager)
		{
			PC->PlayerCameraManager->SetGameCameraCutThisFrame();
		}
	}
	// Nacre passes once across the dawn window, then sinks into the dark below her. Only then does an
	// arm come up out of the dark with the gauge.
	if (NacreBody)
	{
		NacreBody->SetActorLocation(NacreFrom);
	}
	if (Gauge)
	{
		Gauge->SetActorHiddenInGame(true);
	}
	if (AHouseGameMode* GM = Mode())
	{
		GM->SetObjective(TEXT("Swim to the light"));
	}
	// The home motif, on glass bells, as the conservatory opens up.
	Stormworks::Sound2D(this, TEXT("H_Motif"), 0.7f);
	SetBeat(EHouseBeat::Reveal);
}

void AHouseDirector::OnFootDown(bool bLeft, float Speed)
{
	// Something under the floor copies her steps, a beat late, quieter, lower. Only in the house,
	// only until the tentacle shows itself.
	const AMaraCharacter* M = Mara();
	if (!M || Inside < 0.5f || Beat > EHouseBeat::Inspected)
	{
		return;
	}
	bWalking = true;
	EchoStep(0.32f);
}

void AHouseDirector::EchoStep(float After)
{
	const AMaraCharacter* M = Mara();
	if (!M)
	{
		return;
	}
	const FVector Below = M->GetActorLocation() - FVector(0.f, 0.f, 150.f);
	FTimerHandle H;
	GetWorldTimerManager().SetTimer(H, FTimerDelegate::CreateWeakLambda(this, [this, Below]()
	{
		Stormworks::Sound(this, *FString::Printf(TEXT("SFX_Step_Wood_%d"), FMath::RandRange(0, 4)), Below, 0.35f, 0.82f);
		++Echoes;
	}), After, false);
}

void AHouseDirector::TickSoundscape(float Dt)
{
	const AMaraCharacter* M = Mara();
	const bool bIn = M && Interior.IsValid && Interior.IsInside(M->GetActorLocation()) && Beat < EHouseBeat::Descent;
	// The storm muffles the instant she crosses the threshold.
	Inside = FMath::FInterpConstantTo(Inside, bIn ? 1.f : 0.f, Dt, 5.f);
	const bool bWet = (Ride && Ride->IsFlooded()) || Beat >= EHouseBeat::Reveal;
	Under = FMath::FInterpConstantTo(Under, bWet ? 1.f : 0.f, Dt, 1.6f);
	HushT = FMath::Max(0.f, HushT - Dt);
	const float Hush = HushT > 0.f ? 0.2f : 1.f;

	StormCutoff = FMath::Lerp(20000.f, 650.f, FMath::Max(Inside, Under));
	// When the searchlight comes, the storm gets back in through the cracks. When Nacre grabs her,
	// everything outside cuts to nothing but her heartbeat.
	const bool bCracks = Beat == EHouseBeat::Searchlight;
	const float Cut = Beat == EHouseBeat::Grab ? 0.f : 1.f;
	if (bCracks)
	{
		StormCutoff = FMath::Max(StormCutoff, 5000.f);
	}
	if (Storm)
	{
		Storm->SetLowPassFilterFrequency(StormCutoff);
		SetVolume(Storm, (bCracks ? 0.6f : FMath::Lerp(0.7f, 0.3f, Inside)) * (1.f - Under) * Cut);
	}
	SetVolume(Room, (0.08f + 0.5f * Inside) * Hush * (1.f - Under) * Cut);
	SetVolume(Hum, FMath::Lerp(0.3f, 0.08f, Inside) * (1.f - Under) * Cut);
	SetVolume(Deep, 0.6f * Under);
	SetVolume(Heart, 0.5f * FMath::Max(Under, 1.f - Cut) * (Beat < EHouseBeat::Reveal ? 1.f : 0.4f));

	// Under water: blue fog closing in, the rain gone, glowing seeds drifting.
	if (Underwater)
	{
		Underwater->BlendWeight = Under;
	}
	if (Fog)
	{
		Fog->GetComponent()->SetFogDensity(FMath::Lerp(FogDensity, 0.08f, Under));
		Fog->GetComponent()->SetFogInscatteringColor(FMath::Lerp(FogColour, FLinearColor(0.01f, 0.07f, 0.09f), Under));
	}
	if (Rain)
	{
		Rain->SetActorHiddenInGame(Under > 0.5f);
	}
	if (Seeds)
	{
		Seeds->SetActorHiddenInGame(Under < 0.5f);
	}

	// Lightning over the sea, until she is taken under.
	if (StormKey && Beat < EHouseBeat::Descent)
	{
		if (Time > NextFlash)
		{
			NextFlash = Time + FMath::FRandRange(7.f, 13.f);
			FlashT = 0.f;
			ThunderIn = FMath::FRandRange(0.8f, 2.f);
		}
		if (FlashT >= 0.f)
		{
			FlashT += Dt;
			const float F = FlashT < 0.08f ? 1.f : FlashT < 0.2f ? 0.3f : FlashT < 0.28f ? 0.8f : 0.f;
			StormKey->GetLightComponent()->SetIntensity(KeyBase * (1.f + 7.f * F));
			if (FlashT > 0.3f)
			{
				FlashT = -1.f;
			}
		}
		if (ThunderIn >= 0.f)
		{
			ThunderIn -= Dt;
			if (ThunderIn < 0.f)
			{
				Stormworks::Sound2D(this, TEXT("S_TOS_Thunder"), FMath::Lerp(0.8f, 0.35f, Inside), FMath::FRandRange(0.85f, 1.1f));
			}
		}
	}
}

void AHouseDirector::TickDetails(float Dt)
{
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	AMaraCharacter* M = Mara();
	AHouseGameMode* GM = Mode();
	if (!PC || !M || !GM || Inside < 0.5f || Beat > EHouseBeat::Lamp)
	{
		return;
	}
	for (AHouseDetail* D : Details)
	{
		if (!D || D->HasPlayed())
		{
			continue;
		}
		float& T = LookTime.FindOrAdd(D, 0.f);
		T = D->IsLookedAtBy(PC, 30.f) ? T + Dt : 0.f;
		if (T < 0.4f)
		{
			continue;
		}
		D->Play();
		++DetailsPlayed;
		HushT = 1.f;
		switch (D->Kind)
		{
		case EHouseDetailKind::Kettle:
			Stormworks::Sound(this, TEXT("H_Sniff"), FloorDrain, 0.7f);
			GM->ShowMessage(TEXT("Steam rises. Usually."), 3.f);
			break;
		case EHouseDetailKind::HeightMarks:
			// Her hand rises to the mark; the home motif, very quietly.
			if (UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(M->GetMesh()->GetAnimInstance()))
			{
				Anim->PlayAction(TEXT("interact"), 0.8f, 0.2f, 1.2f, true);
			}
			Stormworks::Sound2D(this, TEXT("H_Motif"), 0.25f);
			break;
		case EHouseDetailKind::WaterGlass:
			Stormworks::Sound(this, TEXT("H_WaterClimb"), D->GetActorLocation(), 0.7f);
			// And in the window, her reflection turns its head late.
			if (Reflection)
			{
				Reflection->Lag(0.9f, 3.f);
			}
			break;
		default:
			break;
		}
		UE_LOG(LogStormworks, Log, TEXT("House: detail %d played"), static_cast<int32>(D->Kind));
	}
}

void AHouseDirector::TickTentacle(float Dt)
{
	AMaraCharacter* M = Mara();
	AHouseGameMode* GM = Mode();
	if (!Tentacle || !M || !GM)
	{
		return;
	}
	const FVector Here = M->GetActorLocation();
	// It stops dead when she looks at it; it creeps on when she looks away. The snatch itself is too
	// quick to stop: it plays statue only once it has the gauge.
	const bool bSeen = IsTentacleLookedAt();
	const bool bSneaking = (Beat == EHouseBeat::Stolen && Tentacle->GetHeld()) || Beat == EHouseBeat::Teacup || Beat == EHouseBeat::Lamp;
	if (ShyLeft > 0.f)
	{
		ShyLeft -= Dt;
		if (ShyLeft <= 0.f)
		{
			Tentacle->SetTint(ENacreTint::Pearl);
		}
	}
	const bool bFreeze = bSneaking && bSeen && Tentacle->IsOut() && !Tentacle->IsAtTarget(20.f) && ShyLeft <= 0.f;
	StaredFor = bFreeze ? StaredFor + Dt : 0.f;
	if (StaredFor > 5.f)
	{
		// Stared at for too long, it stops pretending to be a pipe: it flushes coral (embarrassed)
		// and slips on anyway. Nobody can stall the house by watching it.
		StaredFor = 0.f;
		ShyLeft = 2.5f;
		++Shies;
		Tentacle->SetTint(ENacreTint::Coral);
		Stormworks::Sound(this, TEXT("H_Slither"), Tentacle->GetTip(), 0.5f, 1.3f);
	}
	Tentacle->SetFrozen(bFreeze && StaredFor > 0.f);
	if (bSeen && bSneaking && !bSawTentacle)
	{
		bSawTentacle = true;
		GM->ShowMessage(TEXT("That is not a pipe."), 3.f);
	}
	if (Tentacle->IsFrozen())
	{
		bFrozeWhenSeen = true;
	}

	switch (Beat)
	{
	case EHouseBeat::Inspected:
		if ((BeatTime > 4.f && FVector::Dist2D(Here, Gauge->GetActorLocation()) > 170.f) || BeatTime > 12.f)
		{
			// Out of the sink drain, toward the gauge.
			Tentacle->MoveBase(SinkDrain, FRotator::ZeroRotator);
			Tentacle->SnapTip(SinkDrain);
			Tentacle->SetOut(true, 0.8f);
			Tentacle->SetTipTarget(Gauge->GetActorLocation() + FVector(0.f, 0.f, 8.f));
			Stormworks::Sound(this, TEXT("H_Suction"), SinkDrain, 0.7f);
			SetBeat(EHouseBeat::Stolen);
		}
		break;
	case EHouseBeat::Stolen:
		if (!Tentacle->GetHeld() && Tentacle->IsOut() && Tentacle->IsAtTarget(14.f))
		{
			Tentacle->Hold(Gauge);
			Stormworks::Sound(this, TEXT("H_Exhale"), Gauge->GetActorLocation(), 0.6f);
			Tentacle->SetTipTarget(TeacupSpot);
			GM->SetObjective(TEXT("Get the gauge back"));
		}
		else if (Tentacle->GetHeld() && Tentacle->IsAtTarget(14.f))
		{
			// Behind the teacup. Which is far too small.
			Tentacle->SetCurl(0.5f);
			SetBeat(EHouseBeat::Teacup);
		}
		break;
	case EHouseBeat::Teacup:
		if (FVector::Dist2D(Here, TeacupSpot) < 220.f || BeatTime > 20.f)
		{
			Tentacle->SetCurl(0.f);
			Tentacle->SetOut(false, 0.5f);
			Stormworks::Sound(this, TEXT("H_Slurp"), SinkDrain, 0.7f);
			SetBeat(EHouseBeat::Retreat);
		}
		break;
	case EHouseBeat::Retreat:
		if (Tentacle->IsIn())
		{
			// Up through the floor drain instead, toward the lampshade.
			Tentacle->MoveBase(FloorDrain, FRotator::ZeroRotator);
			Tentacle->SnapTip(FloorDrain);
			Tentacle->SetOut(true, 0.6f);
			Tentacle->SetTipTarget(LampSpot);
			Stormworks::Sound(this, TEXT("H_Suction"), FloorDrain, 0.6f);
			SetBeat(EHouseBeat::Lamp);
		}
		break;
	case EHouseBeat::Lamp:
		if (Tentacle->IsAtTarget(20.f))
		{
			Tentacle->SetCurl(0.7f);
		}
		if ((Tentacle->IsAtTarget(20.f) && FVector::Dist2D(Here, LampSpot) < 180.f) || BeatTime > 20.f)
		{
			SetBeat(EHouseBeat::Searchlight);
			Stormworks::Sound2D(this, TEXT("H_Horn"), 0.6f);
			Beam = Searchlight ? Stormworks::SoundAttached(Searchlight->GetRootComponent(), TEXT("H_Searchlight"), 0.6f) : nullptr;
		}
		break;
	default:
		break;
	}
}

void AHouseDirector::TickShake(bool bOn)
{
	AMaraCharacter* M = Mara();
	for (int32 i = 0; i < Rattles.Num(); ++i)
	{
		if (AActor* R = Rattles[i])
		{
			FTransform T = RattleBase[i];
			if (bOn)
			{
				T.AddToTranslation(FVector(FMath::FRandRange(-1.5f, 1.5f), FMath::FRandRange(-1.5f, 1.5f), FMath::FRandRange(0.f, 1.2f)));
				T.ConcatenateRotation(FRotator(FMath::FRandRange(-2.f, 2.f), FMath::FRandRange(-2.f, 2.f), 0.f).Quaternion());
			}
			R->SetActorTransform(T);
		}
	}
	for (int32 i = 0; i < HouseLamps.Num(); ++i)
	{
		if (APointLight* L = HouseLamps[i])
		{
			L->PointLightComponent->SetIntensity(LampBase[i] * (bOn ? FMath::FRandRange(0.35f, 1.f) : 1.f));
		}
	}
	if (M)
	{
		M->CameraBoom->SocketOffset = bOn ? FVector(0.f, FMath::FRandRange(-5.f, 5.f), FMath::FRandRange(-5.f, 5.f)) : FVector::ZeroVector;
	}
}

void AHouseDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 0.1f);
	Time += Dt;
	BeatTime += Dt;
	AMaraCharacter* M = Mara();
	AHouseGameMode* GM = Mode();
	if (!M || !GM)
	{
		return;
	}
	if (!bFootBound)
	{
		if (UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(M->GetMesh()->GetAnimInstance()))
		{
			Anim->OnFootDown.AddUObject(this, &AHouseDirector::OnFootDown);
			bFootBound = true;
		}
	}
	TickSoundscape(Dt);
	TickDetails(Dt);
	TickTentacle(Dt);
	GM->Prompt.Empty();
	if (Reflection)
	{
		Reflection->SetShown(Inside > 0.5f && Beat < EHouseBeat::Searchlight);
	}
	// The thing under the floor stops when she stops, and takes one step more.
	if (bWalking && M->GetVelocity().Size2D() < 10.f)
	{
		bWalking = false;
		if (Inside > 0.5f && Beat <= EHouseBeat::Inspected)
		{
			EchoStep(0.45f);
		}
	}

	switch (Beat)
	{
	case EHouseBeat::Outside:
		if (Inside > 0.5f)
		{
			GM->SetObjective(TEXT("Look for Ivo's clue"));
			SetBeat(EHouseBeat::Inside);
		}
		break;
	case EHouseBeat::Inside:
		if (IsGaugeInReach())
		{
			GM->Prompt = TEXT("[E]  Look");
		}
		break;
	case EHouseBeat::Searchlight:
	{
		// A Watch searchlight crosses the windows; Nacre flattens, deep blue ("hide"); the house shakes.
		if (Searchlight)
		{
			USpotLightComponent* S = Searchlight->SpotLightComponent;
			S->SetIntensity(BeatTime < 2.8f ? 60000.f : 0.f);
			Searchlight->SetActorRotation(FRotator(-8.f, 90.f - 45.f + 90.f * StormEase::InOut(BeatTime / 2.6f), 0.f));
		}
		if (Tentacle)
		{
			Tentacle->SetTint(ENacreTint::Deep);
			Tentacle->SetFrozen(true);
		}
		TickShake(BeatTime > 1.1f);
		if (BeatTime > 1.1f && BeatTime - Dt <= 1.1f)
		{
			Stormworks::Sound2D(this, TEXT("H_Shake"), 0.8f);
		}
		if (BeatTime > 3.f)
		{
			if (Beam)
			{
				Beam->FadeOut(0.5f, 0.f);
				Beam = nullptr;
			}
			// Into the grab: she is placed where the shot expects her.
			M->GetCharacterMovement()->StopMovementImmediately();
			M->SetActorLocationAndRotation(GrabSpot, GrabFacing, false, nullptr, ETeleportType::TeleportPhysics);
			M->GetCharacterMovement()->SetMovementMode(MOVE_Flying);
			if (Tentacle)
			{
				Tentacle->SetFrozen(false);
				Tentacle->SetTint(ENacreTint::Pearl);
			}
			SetBeat(EHouseBeat::Grab);
			if (!GM->Cinema->Play(EStormShot::HouseGrab))
			{
				// No sequence in the project (or already seen): straight on.
				if (Beat == EHouseBeat::Grab)
				{
					StartDescent();
				}
			}
		}
		break;
	}
	case EHouseBeat::Grab:
	{
		// Tentacles from every drain wrap her; the bubble; she is drawn toward the hallway.
		TickShake(BeatTime < 2.2f);
		if (HallDoor)
		{
			// The hall door bursts open ahead of her.
			const float A = 100.f * StormEase::Out(FMath::Clamp((BeatTime - 1.2f) / 0.35f, 0.f, 1.f));
			const FQuat Q(FVector::UpVector, FMath::DegreesToRadians(A));
			HallDoor->SetActorLocationAndRotation(HallDoorHinge + Q.RotateVector(HallDoorBase.GetLocation() - HallDoorHinge), Q * HallDoorBase.GetRotation());
			if (BeatTime > 1.2f && BeatTime - Dt <= 1.2f)
			{
				Stormworks::Sound(this, TEXT("SFX_Creak_1"), HallDoorHinge, 0.9f, 0.8f);
			}
		}
		const FVector Waist = M->GetActorLocation() + FVector(0.f, 0.f, 10.f);
		int32 i = 0;
		for (ANacreTentacle* B : Burst)
		{
			if (B)
			{
				B->SetOut(true, 0.35f);
				B->SetTipTarget(Waist + FVector(FMath::Cos(i * 2.1f) * 30.f, FMath::Sin(i * 2.1f) * 30.f, 0.f));
				B->TipSpeed = 700.f;
			}
			++i;
		}
		if (Tentacle)
		{
			Tentacle->SetTipTarget(Waist);
			Tentacle->TipSpeed = 700.f;
		}
		if (BeatTime > 1.1f)
		{
			M->SetBubble(true);
			if (BeatTime - Dt <= 1.1f)
			{
				Stormworks::Sound2D(this, TEXT("H_Wobble"), 0.7f);
			}
		}
		if (BeatTime > 1.6f)
		{
			const float K = StormEase::InOut((BeatTime - 1.6f) / 1.4f);
			M->SetActorLocation(FMath::Lerp(GrabSpot, HallStart, K), false, nullptr, ETeleportType::TeleportPhysics);
		}
		break;
	}
	case EHouseBeat::Descent:
		if (BeatTime < 6.f)
		{
			GM->Prompt = TEXT("Steer:  WASD  /  left stick");
		}
		break;
	case EHouseBeat::Reveal:
	{
		// A gentle pull toward the largest lantern, for about a second; the camera stays hers.
		APlayerController* PC = Cast<APlayerController>(M->GetController());
		if (RevealLookAt && PC && PC->PlayerCameraManager && BeatTime < 1.2f)
		{
			const FRotator Want = (RevealLookAt->GetActorLocation() - PC->PlayerCameraManager->GetCameraLocation()).Rotation();
			PC->SetControlRotation(FMath::RInterpTo(PC->GetControlRotation(), Want, Dt, 2.5f));
		}
		if (NacreBody)
		{
			const float K = StormEase::InOut(FMath::Clamp(BeatTime / 7.f, 0.f, 1.f));
			NacreBody->SetActorLocation(FMath::Lerp(NacreFrom, NacreTo, K) + FVector(0.f, 0.f, FMath::Sin(Time * 0.6f) * 20.f));
			for (int32 i = 0; i < Arms.Num() && i < ArmOffsets.Num(); ++i)
			{
				if (Arms[i])
				{
					Arms[i]->SetTipTarget(NacreBody->GetActorLocation() + ArmOffsets[i]);
				}
			}
		}
		if (!bOffered && BeatTime > 6.f && Gauge && Offer)
		{
			// Out of the dark, the gauge held up and the tip curled: "come".
			bOffered = true;
			Gauge->SetActorHiddenInGame(false);
			Offer->SetOut(true, 1.2f);
			Offer->SnapTip(Offer->GetActorLocation());
			Offer->SetTipTarget(OfferSpot);
			Offer->SetCurl(1.f);
			Offer->SetTint(ENacreTint::Pearl);
			Offer->Hold(Gauge);
			Stormworks::Sound(this, TEXT("H_Exhale"), OfferSpot, 0.6f, 0.8f);
		}
		if (BeatTime < 7.f)
		{
			GM->Prompt = TEXT("Swim:  WASD + mouse    Space up    C down");
		}
		if (IsOfferInReach())
		{
			GM->Prompt = TEXT("[E]  Take it");
		}
		break;
	}
	case EHouseBeat::Returned:
		if (BeatTime > 4.5f)
		{
			GM->Complete();
		}
		break;
	default:
		break;
	}
}
