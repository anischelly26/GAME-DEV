#include "Stormworks/StormDirector.h"

#include "Components/AudioComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/LightComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/Light.h"
#include "GameFramework/Pawn.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Sound/SoundBase.h"
#include "Stormworks/CollapsingWalkway.h"
#include "Stormworks/StormCheckpoint.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormMusic.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/TetherMovable.h"

AStormDirector::AStormDirector()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AStormDirector::BeginPlay()
{
	Super::BeginPlay();
	if (Coupling)
	{
		Coupling->OnArrived.AddUObject(this, &AStormDirector::OnCouplingArrived);
	}
	if (StormLight && StormLight->GetLightComponent())
	{
		BaseLightIntensity = StormLight->GetLightComponent()->Intensity;
	}
	for (ALight* L : AlarmLamps)
	{
		if (L && L->GetLightComponent())
		{
			L->GetLightComponent()->SetIntensity(0.f);
		}
	}
	if (USoundBase* S = LoadObject<USoundBase>(nullptr, TEXT("/Game/ItTakesOne/Stormworks/Audio/S_TOS_Wind.S_TOS_Wind"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Wind = UGameplayStatics::SpawnSound2D(this, S, 0.55f, 1.f, 0.f, nullptr, true, false);
	}
	NextFlash = FMath::FRandRange(4.f, 8.f);
}

void AStormDirector::OnCouplingArrived(ATetherMovable* M)
{
	if (!bEngaged)
	{
		Engage();
	}
}

void AStormDirector::Engage()
{
	bEngaged = true;
	EngagedT = 0.f;
	if (Gate)
	{
		Gate->Tug();
	}
	if (Walkway)
	{
		Walkway->Arm();
	}
	Flash(1.4f);
	if (USoundBase* S = LoadObject<USoundBase>(nullptr, TEXT("/Game/ItTakesOne/Stormworks/Audio/S_TOS_Alarm.S_TOS_Alarm"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Alarm = UGameplayStatics::SpawnSound2D(this, S, 0.45f, 1.f, 0.f, nullptr, true, false);
	}
	Stormworks::Sound2D(this, TEXT("S_TOS_EngineStart"), 1.f);
	if (Wind)
	{
		Wind->SetVolumeMultiplier(0.85f);
	}
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		GM->ShowMessage(TEXT("The storm engine is live. The gate is opening!"), 3.f);
		// The reveal shows the gate opening and the catwalk; its end sets the objective (and the
		// music), once, whether it is watched or skipped.
		GM->Music->SetMood(EStormMood::Anticipation);
		GM->Cinema->Play(EStormShot::EngineReveal);
	}
	if (APawn* P = UGameplayStatics::GetPlayerPawn(this, 0))
	{
		if (UTetherComponent* T = P->FindComponentByClass<UTetherComponent>())
		{
			T->AddShake(0.7f);
		}
	}
	UE_LOG(LogStormworks, Log, TEXT("Storm engine engaged"));
}

void AStormDirector::OnRespawn(AStormCheckpoint* Checkpoint)
{
	if (bEngaged && Walkway && Checkpoint && Checkpoint->Order >= ClimaxCheckpointOrder)
	{
		Walkway->ResetWalkway();
	}
}

void AStormDirector::Flash(float Strength)
{
	FlashT = 0.f;
	FlashStrength = Strength;
	ThunderIn = FMath::FRandRange(0.5f, 1.4f);
	++Flashes;
}

void AStormDirector::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;

	// Lightning: two or three quick flickers, then thunder rolls in.
	NextFlash -= DeltaSeconds;
	if (NextFlash <= 0.f)
	{
		Flash(FMath::FRandRange(0.7f, 1.2f));
		NextFlash = bEngaged ? FMath::FRandRange(4.f, 9.f) : FMath::FRandRange(8.f, 16.f);
	}
	if (StormLight && StormLight->GetLightComponent())
	{
		float Mult = 1.f;
		if (FlashT >= 0.f)
		{
			FlashT += DeltaSeconds;
			const float F = FlashT < 0.07f ? 1.f : (FlashT < 0.13f ? 0.15f : (FlashT < 0.22f ? 0.8f : FMath::Max(0.f, 1.f - (FlashT - 0.22f) * 3.f) * 0.5f));
			Mult = 1.f + 14.f * FlashStrength * F;
			if (FlashT > 0.6f)
			{
				FlashT = -1.f;
			}
		}
		StormLight->GetLightComponent()->SetIntensity(BaseLightIntensity * Mult);
	}
	if (ThunderIn >= 0.f)
	{
		ThunderIn -= DeltaSeconds;
		if (ThunderIn < 0.f)
		{
			Stormworks::Sound2D(this, TEXT("S_TOS_Thunder"), 0.8f * FlashStrength, FMath::FRandRange(0.85f, 1.1f));
		}
	}

	// Alarm lamps: a slow red beacon pulse once the engine is live.
	if (bEngaged)
	{
		EngagedT += DeltaSeconds;
		const float Pulse = FMath::Pow(FMath::Max(0.f, FMath::Sin(Time * 5.f)), 3.f);
		for (ALight* L : AlarmLamps)
		{
			if (L && L->GetLightComponent())
			{
				// A warning at the edge of the eye: bright enough to feel, not enough to hide the path.
				L->GetLightComponent()->SetIntensity(300.f + 4500.f * Pulse);
			}
		}
		if (Alarm && EngagedT > 14.f)
		{
			Alarm->FadeOut(3.f, 0.f);
			Alarm = nullptr;
		}
	}
}
