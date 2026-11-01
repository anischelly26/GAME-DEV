#include "House/NacreMantle.h"

#include "Materials/MaterialInterface.h"
#include "ProceduralMeshComponent.h"

namespace
{
	// The profile, bottom to top: height and radius, as parts of Radius.
	const FVector2D Profile[] = {
		{-0.62f, 0.02f}, {-0.60f, 0.42f}, {-0.46f, 0.72f}, {-0.24f, 0.82f}, {-0.04f, 0.74f}, {0.12f, 0.66f}, {0.36f, 0.80f},
		{0.72f, 0.96f}, {1.08f, 0.86f}, {1.38f, 0.56f}, {1.54f, 0.22f}, {1.58f, 0.01f}};
	constexpr int32 NumKeys = UE_ARRAY_COUNT(Profile);
	constexpr int32 Rings = 34;
	constexpr int32 Sides = 24;

	FVector2D ProfileAt(float U)
	{
		const float X = FMath::Clamp(U, 0.f, 1.f) * (NumKeys - 1);
		const int32 I = FMath::Min(FMath::FloorToInt(X), NumKeys - 2);
		const FVector2D P0 = Profile[FMath::Max(I - 1, 0)];
		const FVector2D P1 = Profile[I];
		const FVector2D P2 = Profile[I + 1];
		const FVector2D P3 = Profile[FMath::Min(I + 2, NumKeys - 1)];
		const float T = X - I;
		// Catmull-Rom, so the silhouette has no corners.
		return 0.5f * ((2.f * P1) + (P2 - P0) * T + (2.f * P0 - 5.f * P1 + 4.f * P2 - P3) * (T * T) + (3.f * P1 - P0 - 3.f * P2 + P3) * (T * T * T));
	}
}

ANacreMantle::ANacreMantle()
{
	PrimaryActorTick.bCanEverTick = true;
	Mantle = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Mantle"));
	SetRootComponent(Mantle);
	Mantle->SetMobility(EComponentMobility::Movable);
	Mantle->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void ANacreMantle::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_NacreBody.MI_House_NacreBody"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Mantle->SetMaterial(0, M);
	}
	bMade = false;
	Build(0.f);
}

void ANacreMantle::Build(float Breath)
{
	const int32 Across = Sides + 1;
	TArray<FVector> Vertices;
	TArray<FVector> Normals;
	TArray<FVector2D> UVs;
	TArray<FLinearColor> Colors;
	TArray<FProcMeshTangent> Tangents;
	Vertices.SetNumUninitialized(Rings * Across);
	Normals.SetNumUninitialized(Rings * Across);
	UVs.SetNumUninitialized(Rings * Across);
	Colors.Init(FLinearColor::Black, Rings * Across);
	Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), Rings * Across);
	for (int32 i = 0; i < Rings; ++i)
	{
		const float U = static_cast<float>(i) / (Rings - 1);
		const FVector2D P = ProfileAt(U);
		const FVector2D Next = ProfileAt(U + 0.01f);
		const FVector2D Prev = ProfileAt(U - 0.01f);
		const FVector2D Along = (Next - Prev).GetSafeNormal();
		// The mantle fills and empties; the head below it hardly moves.
		const float Swell = 1.f + Breath * 0.08f * FMath::SmoothStep(0.1f, 0.7f, static_cast<float>(P.X));
		for (int32 j = 0; j < Across; ++j)
		{
			const float A = 2.f * PI * j / Sides;
			const FVector Round(FMath::Cos(A), FMath::Sin(A), 0.f);
			const int32 V = i * Across + j;
			Vertices[V] = (Round * (P.Y * Swell) + FVector(0.f, 0.f, P.X)) * Radius;
			Normals[V] = (Round * Along.X - FVector(0.f, 0.f, Along.Y)).GetSafeNormal();
			UVs[V] = FVector2D(static_cast<float>(j) / Sides, U);
		}
	}
	if (!bMade)
	{
		TArray<int32> Triangles;
		for (int32 i = 0; i < Rings - 1; ++i)
		{
			for (int32 j = 0; j < Sides; ++j)
			{
				const int32 A = i * Across + j;
				const int32 B = A + 1;
				const int32 C = A + Across;
				const int32 D = C + 1;
				Triangles.Append({A, B, C, B, D, C});
			}
		}
		Mantle->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
		bMade = true;
	}
	else
	{
		Mantle->UpdateMeshSection_LinearColor(0, Vertices, Normals, UVs, Colors, Tangents);
	}
}

void ANacreMantle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	if (Mantle->WasRecentlyRendered(0.3f))
	{
		Build(FMath::Sin(Time * 1.1f));
	}
}
