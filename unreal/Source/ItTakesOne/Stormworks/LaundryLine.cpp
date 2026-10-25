#include "Stormworks/LaundryLine.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Stormworks/StormworksAssets.h"

ALaundryLine::ALaundryLine()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Rope = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Rope"));
	Rope->SetupAttachment(Root);
	Rope->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ALaundryLine::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Rope->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
	Rope->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Cloth")));
	Rope->SetRelativeLocation(FVector(Length * 0.5f, 0.f, 0.f));
	Rope->SetRelativeRotation(FRotator(90.f, 0.f, 0.f));
	Rope->SetRelativeScale3D(FVector(0.012f, 0.012f, Length / 100.f));

	// The washing, pegged along the rope: sheets, shirts and towels, from a fixed seed. Built by the
	// construction script so it shows in the editor too; BeginPlay finds the hinges again.
	FRandomStream R(Seed);
	float X = 40.f;
	int32 i = 0;
	while (true)
	{
		const int32 Kind = R.RandRange(0, 2);
		const float W = Kind == 0 ? R.FRandRange(85.f, 110.f) : Kind == 1 ? R.FRandRange(55.f, 65.f) : R.FRandRange(45.f, 55.f);
		const float H = Kind == 0 ? R.FRandRange(95.f, 115.f) : Kind == 1 ? R.FRandRange(60.f, 70.f) : R.FRandRange(65.f, 80.f);
		if (X + W > Length - 30.f)
		{
			break;
		}
		USceneComponent* Hinge = NewObject<USceneComponent>(this, *FString::Printf(TEXT("Hinge_%d"), i));
		Hinge->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		Hinge->SetMobility(EComponentMobility::Movable);
		Hinge->SetupAttachment(Root);
		Hinge->SetRelativeLocation(FVector(X + W * 0.5f, 0.f, 0.f));
		Hinge->RegisterComponent();
		UStaticMeshComponent* Cloth = NewObject<UStaticMeshComponent>(this, *FString::Printf(TEXT("Cloth_%d"), i));
		Cloth->CreationMethod = EComponentCreationMethod::UserConstructionScript;
		Cloth->SetMobility(EComponentMobility::Movable);
		Cloth->SetupAttachment(Hinge);
		Cloth->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
		Cloth->SetMaterial(0, Stormworks::Material(*FString::Printf(TEXT("MI_TOS_Laundry_%d"), R.RandRange(0, 3))));
		Cloth->SetRelativeLocation(FVector(0.f, 0.f, -H * 0.5f));
		Cloth->SetRelativeScale3D(FVector(W / 100.f, 0.008f, H / 100.f));
		Cloth->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Cloth->RegisterComponent();
		X += W + R.FRandRange(12.f, 30.f);
		++i;
	}
}

void ALaundryLine::BeginPlay()
{
	Super::BeginPlay();
	Pieces.Reset();
	TArray<USceneComponent*> All;
	GetComponents<USceneComponent>(All);
	FRandomStream R(Seed * 31 + 5);
	for (USceneComponent* C : All)
	{
		if (C->GetName().StartsWith(TEXT("Hinge_")))
		{
			FPiece P;
			P.Hinge = C;
			P.Phase = R.FRandRange(0.f, 2.f * PI);
			P.Rate = R.FRandRange(0.8f, 1.3f);
			if (const USceneComponent* Cloth = C->GetNumChildrenComponents() > 0 ? C->GetChildComponent(0) : nullptr)
			{
				P.Width = Cloth->GetRelativeScale3D().X * 100.f;
			}
			Pieces.Add(P);
		}
	}
}

float ALaundryLine::SwingNear(const FVector& Where) const
{
	const FPiece* Best = nullptr;
	float BestD = TNumericLimits<float>::Max();
	for (const FPiece& P : Pieces)
	{
		const float D = FVector::Dist2D(P.Hinge->GetComponentLocation(), Where);
		if (D < BestD)
		{
			BestD = D;
			Best = &P;
		}
	}
	return Best ? Best->Angle : 0.f;
}

void ALaundryLine::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	Time += Dt;
	// Gusts come and go over several seconds.
	const float Gust = 0.55f + 0.45f * FMath::Sin(Time * 0.31f) * FMath::Sin(Time * 0.17f + 1.3f);
	const APawn* Mara = GetWorld()->GetFirstPlayerController() ? GetWorld()->GetFirstPlayerController()->GetPawn() : nullptr;
	const float MaraSpeed = Mara ? Mara->GetVelocity().Size2D() : 0.f;
	for (FPiece& P : Pieces)
	{
		const float Target = WindSide * (12.f + 14.f * Gust + 6.f * FMath::Sin(Time * P.Rate * 2.2f + P.Phase));
		// Running past it, she sets it flapping (at most once a second per piece).
		if (Mara && MaraSpeed > 250.f && Time - P.NearT > 1.f && FVector::Dist2D(Mara->GetActorLocation(), P.Hinge->GetComponentLocation()) < P.Width * 0.5f + 90.f)
		{
			P.NearT = Time;
			P.Speed += WindSide * 140.f;
			++Brushes;
		}
		const float Acc = 38.f * (Target - P.Angle) - 4.f * P.Speed;
		P.Speed += Acc * Dt;
		P.Angle += P.Speed * Dt;
		P.Hinge->SetRelativeRotation(FRotator(0.f, 3.f * Gust * FMath::Sin(Time * 6.5f * P.Rate + P.Phase), P.Angle));
	}
}
