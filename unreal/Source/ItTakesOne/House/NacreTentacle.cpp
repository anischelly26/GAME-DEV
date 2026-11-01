#include "House/NacreTentacle.h"

#include "Components/AudioComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "ProceduralMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	FLinearColor TintColour(ENacreTint T)
	{
		switch (T)
		{
		case ENacreTint::Coral: return FLinearColor(0.88f, 0.36f, 0.3f);
		case ENacreTint::Deep: return FLinearColor(0.03f, 0.08f, 0.32f);
		default: return FLinearColor(0.82f, 0.8f, 0.84f);
		}
	}
}

ANacreTentacle::ANacreTentacle()
{
	PrimaryActorTick.bCanEverTick = true;
	Body = CreateDefaultSubobject<UProceduralMeshComponent>(TEXT("Body"));
	SetRootComponent(Body);
	Body->SetMobility(EComponentMobility::Movable);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetUsingAbsoluteScale(true);
	Suckers = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Suckers"));
	Suckers->SetupAttachment(Body);
	Suckers->SetMobility(EComponentMobility::Movable);
	Suckers->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Suckers->SetCastShadow(false);
	Suckers->SetUsingAbsoluteLocation(true);
	Suckers->SetUsingAbsoluteRotation(true);
	Suckers->SetUsingAbsoluteScale(true);
}

void ANacreTentacle::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_Nacre.MI_House_Nacre"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Body->SetMaterial(0, M);
	}
	Suckers->SetStaticMesh(Stormworks::Mesh(TEXT("Sphere")));
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_Sucker.MI_House_Sucker"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Suckers->SetMaterial(0, M);
	}
}

void ANacreTentacle::BeginPlay()
{
	Super::BeginPlay();
	Seed = FMath::FRandRange(0.f, 10.f);
	Tip = TipTarget = bStartOut ? InitialTip : GetActorLocation();
	if (bStartOut)
	{
		Extend = ExtendWant = 1.f;
	}
	Skin = Body->CreateDynamicMaterialInstance(0);
	Suckers->ClearInstances();
	if (!bSilhouette)
	{
		TArray<FTransform> Initial;
		Initial.Init(FTransform(FQuat::Identity, GetActorLocation(), FVector::ZeroVector), Segments / 2 - 3);
		Suckers->AddInstances(Initial, false, true);
	}
	// A quiet wet slither that follows how fast the tip moves.
	Slither = Stormworks::SoundAttached(Body, TEXT("H_Slither"), 0.f);
	Draw();
}

void ANacreTentacle::SetOut(bool bOut, float Seconds)
{
	ExtendWant = bOut ? 1.f : 0.f;
	ExtendRate = 1.f / FMath::Max(Seconds, 0.05f);
}

void ANacreTentacle::SnapTip(const FVector& Where)
{
	Tip = TipTarget = Where;
}

void ANacreTentacle::MoveBase(const FVector& Where, const FRotator& Facing)
{
	SetActorLocationAndRotation(Where, Facing);
}

bool ANacreTentacle::IsAtTarget(float Tolerance) const
{
	return FVector::Dist(Tip, TipTarget) < Tolerance;
}

FVector ANacreTentacle::CurvePoint(float U) const
{
	// From the base along its "up" (out of the drain), arching over to the tip.
	const FVector B = GetActorLocation();
	const FVector Out = GetActorUpVector();
	const FVector T = FMath::Lerp(B, Tip, Extend);
	const float Span = FVector::Dist(B, T);
	const FVector P1 = B + Out * FMath::Min(Span * 0.5f, 140.f) * Extend;
	const FVector P2 = T + Out * FMath::Min(Span * 0.25f, 60.f) * Extend;
	const float V = 1.f - U;
	FVector P = V * V * V * B + 3.f * V * V * U * P1 + 3.f * V * U * U * P2 + U * U * U * T;

	// Sway: nothing at the base or the tip, most in the middle.
	const FVector Along = (T - B).GetSafeNormal();
	const FVector Side = FVector::CrossProduct(Along.IsNearlyZero() ? FVector::ForwardVector : Along, Out).GetSafeNormal();
	const float Bell = 4.f * U * (1.f - U);
	P += Side * FMath::Sin(SwayTime * 2.3f + U * 5.f + Seed) * 9.f * Bell * Extend;
	P += Out * FMath::Sin(SwayTime * 1.7f + U * 4.f + Seed * 2.f) * 4.f * Bell * Extend;

	// The curl: the last fifth of the tentacle rolls back over itself.
	if (Curl > 0.01f && U > 0.8f)
	{
		const float K = (U - 0.8f) / 0.2f;
		const float A = Curl * K * PI * 1.5f;
		const FVector Back = -(T - P2).GetSafeNormal();
		P += (Out * FMath::Sin(A) + Back * (1.f - FMath::Cos(A))) * 12.f * K;
	}
	return P;
}

void ANacreTentacle::Draw()
{
	const bool bShown = Extend > 0.02f;
	if (Body->IsVisible() != bShown)
	{
		// Hidden inside its base while it is drawn in.
		Body->SetVisibility(bShown, true);
	}
	if (!bShown)
	{
		return;
	}
	const int32 Rings = FMath::Max(Segments, 2);
	const int32 Across = Sides + 1;
	const FTransform& World = Body->GetComponentTransform();
	TArray<FVector, TInlineAllocator<64>> Points;
	Points.SetNum(Rings);
	for (int32 i = 0; i < Rings; ++i)
	{
		Points[i] = CurvePoint(static_cast<float>(i) / (Rings - 1));
	}
	Vertices.SetNum(Rings * Across);
	Normals.SetNum(Rings * Across);
	UVs.SetNum(Rings * Across);
	Colors.SetNum(Rings * Across);
	Tangents.SetNum(Rings * Across);

	// The frame is carried along the curve, so the tube does not twist. Its underside starts facing
	// down from the base and stays on the same side of the arm.
	FVector Under = FVector::ZeroVector;
	int32 Sucker = 0;
	const int32 NumSuckers = Suckers->GetInstanceCount();
	for (int32 i = 0; i < Rings; ++i)
	{
		const float U = static_cast<float>(i) / (Rings - 1);
		const FVector Span = Points[FMath::Min(i + 1, Rings - 1)] - Points[FMath::Max(i - 1, 0)];
		const FVector Dir = Span.IsNearlyZero() ? GetActorUpVector() : Span.GetSafeNormal();
		if (Under.IsNearlyZero())
		{
			Under = FMath::Abs(Dir.Z) > 0.9f ? FVector::ForwardVector : -FVector::UpVector;
		}
		Under = (Under - Dir * FVector::DotProduct(Under, Dir)).GetSafeNormal();
		const FVector Side = FVector::CrossProduct(Dir, Under);
		// Thick at the base, a slow muscular swell along it, closing to a point at the tip.
		const float R = FMath::Lerp(BaseRadius, TipRadius, FMath::Pow(U, 0.8f))
			* (1.f + 0.05f * FMath::Sin(U * 16.f + SwayTime * 1.4f + Seed))
			* FMath::Clamp((1.f - U) / 0.06f, 0.08f, 1.f);
		// Flat when hiding: wide and low.
		const float RUnder = R * (1.f - 0.45f * Flat);
		const float RSide = R * (1.f + 0.35f * Flat);
		for (int32 j = 0; j < Across; ++j)
		{
			const float A = 2.f * PI * j / Sides;
			const float C = FMath::Cos(A);
			const float S = FMath::Sin(A);
			const FVector Round = Under * C + Side * S;
			const int32 V = i * Across + j;
			Vertices[V] = World.InverseTransformPosition(Points[i] + Under * (C * RUnder) + Side * (S * RSide));
			Normals[V] = World.InverseTransformVectorNoScale(Round);
			UVs[V] = FVector2D(U * 6.f, static_cast<float>(j) / Sides);
			// R: how much of the paler underside.
			Colors[V] = FLinearColor(FMath::Clamp(C * 1.6f, 0.f, 1.f), 0.f, 0.f, 1.f);
			Tangents[V] = FProcMeshTangent(World.InverseTransformVectorNoScale(Dir), false);
		}
		// A sucker on every second ring, along the underside, from the middle of the arm out.
		if (Sucker < NumSuckers && i % 2 == 0 && U > 0.1f)
		{
			const float D = R * 0.42f;
			const FQuat Face = FRotationMatrix::MakeFromXZ(Dir, -Under).ToQuat();
			Suckers->UpdateInstanceTransform(Sucker, FTransform(Face, Points[i] + Under * (RUnder * 0.86f), FVector(D, D, D * 0.35f) * (2.f / 100.f)), true, false, true);
			++Sucker;
		}
	}
	if (NumSuckers > 0)
	{
		Suckers->MarkRenderStateDirty();
	}
	if (!bTubeMade)
	{
		TArray<int32> Triangles;
		Triangles.Reserve((Rings - 1) * Sides * 6);
		for (int32 i = 0; i < Rings - 1; ++i)
		{
			for (int32 j = 0; j < Sides; ++j)
			{
				const int32 A = i * Across + j;
				const int32 B = A + 1;
				const int32 C = A + Across;
				const int32 D = C + 1;
				Triangles.Append({A, C, B, B, C, D});
			}
		}
		Body->CreateMeshSection_LinearColor(0, Vertices, Triangles, Normals, UVs, Colors, Tangents, false);
		bTubeMade = true;
	}
	else
	{
		Body->UpdateMeshSection_LinearColor(0, Vertices, Normals, UVs, Colors, Tangents);
	}
}

void ANacreTentacle::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	const float Dt = FMath::Min(DeltaSeconds, 0.05f);
	Extend = FMath::FInterpConstantTo(Extend, ExtendWant, Dt, ExtendRate);
	Curl = FMath::FInterpTo(Curl, CurlWant, Dt, 6.f);
	Flat = FMath::FInterpTo(Flat, Tint == ENacreTint::Deep ? 1.f : 0.f, Dt, 8.f);
	Colour = FMath::Lerp(Colour, bSilhouette ? FLinearColor(0.012f, 0.012f, 0.018f) : TintColour(Tint), FMath::Min(1.f, Dt * 5.f));

	const FVector Before = Tip;
	if (!bFrozen)
	{
		SwayTime += Dt;
		// Keep the target within reach of the base.
		const FVector B = GetActorLocation();
		FVector Want = TipTarget;
		if (FVector::Dist(B, Want) > Reach)
		{
			Want = B + (Want - B).GetSafeNormal() * Reach;
		}
		const FVector Step = Want - Tip;
		const float Max = TipSpeed * Dt;
		// Eased: full speed when far, slowing over the last 40 cm.
		const float Speed = FMath::Min(Max, Step.Size() * FMath::Min(1.f, Dt * 6.f) + Max * 0.15f);
		Tip += Step.GetClampedToMaxSize(Speed);
	}
	LastTipSpeed = Dt > 0.f ? FVector::Dist(Before, Tip) / Dt : 0.f;

	if (Skin)
	{
		Skin->SetVectorParameterValue(TEXT("BaseColor"), Colour * 0.8f);
		Skin->SetVectorParameterValue(TEXT("BellyColor"), Colour * 1.1f + FLinearColor(0.05f, 0.04f, 0.04f));
		Skin->SetVectorParameterValue(TEXT("EmissiveColor"), Colour);
		// Lit by the room, not glowing: only the coral and the deep blue carry a little light of their own.
		Skin->SetScalarParameterValue(TEXT("EmissiveStrength"), bSilhouette ? 0.f : Tint == ENacreTint::Pearl ? 0.03f : 0.2f);
	}
	if (AActor* H = Held.Get())
	{
		// Held in the curl, a little short of the tip, not stuck on the end of it.
		H->SetActorLocation(CurvePoint(0.93f) + FVector(0.f, 0.f, -4.f));
	}
	if (Slither)
	{
		Slither->SetVolumeMultiplier(FMath::Clamp(LastTipSpeed / 300.f, 0.f, 1.f) * 0.5f * Extend);
	}
	Draw();
}
