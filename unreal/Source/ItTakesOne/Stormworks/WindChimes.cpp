#include "Stormworks/WindChimes.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "ItTakesOne.h"
#include "Stormworks/StormEase.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	constexpr float Anticipation = 0.08f;
	constexpr float Cascade = 0.11f;
}

AWindChimes::AWindChimes()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Bracket = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Bracket"));
	Bracket->SetupAttachment(Root);
	Bracket->SetRelativeLocation(FVector(0.f, 0.f, 2.f));
	Bracket->SetRelativeScale3D(FVector(0.58f, 0.06f, 0.04f));
	Bracket->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	for (int32 i = 0; i < 5; ++i)
	{
		USceneComponent* Hinge = CreateDefaultSubobject<USceneComponent>(*FString::Printf(TEXT("Hinge_%d"), i));
		Hinge->SetupAttachment(Root);
		Hinge->SetMobility(EComponentMobility::Movable);
		Hinge->SetRelativeLocation(FVector(-22.f + 11.f * i, 0.f, 0.f));
		// Longest (lowest note) first.
		const float L = 50.f - 5.f * i;
		UStaticMeshComponent* Tube = CreateDefaultSubobject<UStaticMeshComponent>(*FString::Printf(TEXT("Tube_%d"), i));
		Tube->SetupAttachment(Hinge);
		Tube->SetRelativeLocation(FVector(0.f, 0.f, -L * 0.5f - 6.f));
		Tube->SetRelativeScale3D(FVector(0.034f, 0.034f, L / 100.f));
		Tube->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		TubeMeshes.Add(Tube);
		Tubes[i].Hinge = Hinge;
	}
}

void AWindChimes::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Bracket->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Bracket->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Iron")));
	for (UStaticMeshComponent* Tube : TubeMeshes)
	{
		Tube->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
		Tube->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Brass")));
	}
}

void AWindChimes::Ring(float Strength)
{
	++Rings;
	for (int32 i = 0; i < 5; ++i)
	{
		Tubes[i].StartT = Time + Cascade * i;
		Tubes[i].Strength = Strength;
		Tubes[i].bStruck = false;
	}
}

void AWindChimes::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;

	// Mara walking up to them rings the whole scale; she has to walk away before it rings again.
	if (const APawn* Mara = GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr)
	{
		const float D = FVector::Dist2D(Mara->GetActorLocation(), GetActorLocation());
		if (bArmed && D < Near)
		{
			bArmed = false;
			Ring(1.f);
			UE_LOG(LogStormworks, Log, TEXT("Chimes: rung (%d)"), Rings);
		}
		else if (!bArmed && D > Away)
		{
			bArmed = true;
		}
	}
	// Now and then the storm knocks one, quietly.
	if (Time > NextGust)
	{
		NextGust = Time + FMath::FRandRange(6.f, 11.f);
		FTube& T = Tubes[FMath::RandRange(0, 4)];
		if (T.StartT < 0.f)
		{
			T.StartT = Time;
			T.Strength = 0.35f;
			T.bStruck = false;
		}
	}

	for (int32 i = 0; i < 5; ++i)
	{
		FTube& T = Tubes[i];
		float Angle = 0.f;
		const float S = Time - T.StartT;
		if (T.StartT >= 0.f && S >= 0.f)
		{
			if (S < Anticipation)
			{
				Angle = -3.f * T.Strength * StormEase::InOut(S / Anticipation);
			}
			else
			{
				if (!T.bStruck)
				{
					T.bStruck = true;
					if (Time - T.LastNote > 0.25f)
					{
						T.LastNote = Time;
						Stormworks::Sound(this, *FString::Printf(TEXT("S_TOS_Chime_%d"), i), T.Hinge->GetComponentLocation(), 0.55f * T.Strength + 0.1f);
						++Notes;
					}
				}
				const float U = S - Anticipation;
				Angle = 16.f * T.Strength * FMath::Exp(-1.3f * U) * FMath::Sin(2.f * PI * (0.85f + 0.07f * i) * U) - 3.f * T.Strength * FMath::Exp(-12.f * U);
				if (U > 4.f)
				{
					T.StartT = -1.f;
				}
			}
		}
		T.Hinge->SetRelativeRotation(FRotator(Angle * 0.3f, 0.f, Angle));
	}
}
