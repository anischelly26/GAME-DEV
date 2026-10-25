#include "Stormworks/StormRain.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "Stormworks/StormworksAssets.h"

AStormRain::AStormRain()
{
	PrimaryActorTick.bCanEverTick = true;
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	Streaks = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Streaks"));
	SetRootComponent(Streaks);
	Streaks->SetMobility(EComponentMobility::Movable);
	Streaks->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Streaks->SetCastShadow(false);
	Streaks->SetUsingAbsoluteLocation(true);
	Streaks->SetUsingAbsoluteRotation(true);
}

void AStormRain::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Streaks->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, *MaterialPath, nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Streaks->SetMaterial(0, M);
	}
}

void AStormRain::BeginPlay()
{
	Super::BeginPlay();
	Streaks->SetWorldLocation(FVector::ZeroVector);
	Offsets.SetNum(Count);
	Transforms.SetNum(Count);
	for (int32 i = 0; i < Count; ++i)
	{
		Offsets[i] = FVector(FMath::FRandRange(-Extent.X, Extent.X), FMath::FRandRange(-Extent.Y, Extent.Y), FMath::FRandRange(-Extent.Z, Extent.Z));
	}
	Streaks->ClearInstances();
	TArray<FTransform> Initial;
	Initial.Init(FTransform::Identity, Count);
	Streaks->AddInstances(Initial, false, true);
}

void AStormRain::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = GetWorld()->GetFirstPlayerController();
	if (!PC || !PC->PlayerCameraManager || Offsets.Num() != Count)
	{
		return;
	}
	const FVector Cam = PC->PlayerCameraManager->GetCameraLocation();
	// A streak points along its fall, stretched by its speed.
	const FRotator Along = Velocity.Rotation() + FRotator(90.f, 0.f, 0.f);
	const FVector Scale = StreakScale;
	for (int32 i = 0; i < Count; ++i)
	{
		FVector& O = Offsets[i];
		O += Velocity * DeltaSeconds;
		for (int32 Axis = 0; Axis < 3; ++Axis)
		{
			const float E = Extent[Axis];
			if (O[Axis] < -E)
			{
				O[Axis] += 2.f * E;
			}
			else if (O[Axis] > E)
			{
				O[Axis] -= 2.f * E;
			}
		}
		const FVector At = Cam + O;
		bool bDry = false;
		for (const FBox& B : DryBoxes)
		{
			bDry |= B.IsInside(At);
		}
		Transforms[i] = FTransform(Along, At, bDry ? FVector::ZeroVector : Scale);
	}
	Streaks->BatchUpdateInstancesTransforms(0, Transforms, true, true, true);
}
