#include "House/NacreTentacle.h"

#include "Components/AudioComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
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
	Body = CreateDefaultSubobject<UInstancedStaticMeshComponent>(TEXT("Body"));
	SetRootComponent(Body);
	Body->SetMobility(EComponentMobility::Movable);
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetCastShadow(false);
	Body->SetUsingAbsoluteRotation(true);
	Body->SetUsingAbsoluteScale(true);
}

void ANacreTentacle::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Body->SetStaticMesh(Stormworks::Mesh(TEXT("Sphere")));
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_Nacre.MI_House_Nacre"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Body->SetMaterial(0, M);
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
	Body->ClearInstances();
	TArray<FTransform> Initial;
	Initial.Init(FTransform(FQuat::Identity, GetActorLocation(), FVector::ZeroVector), Segments);
	Body->AddInstances(Initial, false, true);
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
	// Each sphere is stretched along the curve, long enough to overlap its neighbours: one smooth
	// arm, not a string of beads.
	TArray<FVector, TInlineAllocator<64>> Points;
	Points.SetNum(Segments);
	for (int32 i = 0; i < Segments; ++i)
	{
		Points[i] = CurvePoint(Segments > 1 ? static_cast<float>(i) / (Segments - 1) : 0.f);
	}
	// Hidden inside the base while it is drawn in: only the part that is out shows.
	const bool bShown = Extend > 0.02f;
	for (int32 i = 0; i < Segments; ++i)
	{
		const float U = Segments > 1 ? static_cast<float>(i) / (Segments - 1) : 0.f;
		const FVector Span = Points[FMath::Min(i + 1, Segments - 1)] - Points[FMath::Max(i - 1, 0)];
		const float Spacing = Span.Size() * (i == 0 || i == Segments - 1 ? 1.f : 0.5f);
		const FVector Dir = Span.IsNearlyZero() ? GetActorUpVector() : Span.GetSafeNormal();
		const float R = FMath::Lerp(BaseRadius, TipRadius, FMath::Pow(U, 0.8f));
		// Flat when hiding: wide and low.
		const FVector Scale = bShown ? FVector(FMath::Max(2.f * R, Spacing * 1.7f), 2.f * R * (1.f + 0.35f * Flat), 2.f * R * (1.f - 0.45f * Flat)) / 100.f : FVector::ZeroVector;
		const FQuat Facing = FRotationMatrix::MakeFromXZ(Dir, FVector::UpVector).ToQuat();
		Body->UpdateInstanceTransform(i, FTransform(Facing, Points[i], Scale), true, i == Segments - 1, true);
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
		Skin->SetVectorParameterValue(TEXT("BaseColor"), Colour);
		Skin->SetVectorParameterValue(TEXT("EmissiveColor"), Colour);
		Skin->SetScalarParameterValue(TEXT("EmissiveStrength"), bSilhouette ? 0.f : Tint == ENacreTint::Deep ? 0.15f : 0.35f);
	}
	if (AActor* H = Held.Get())
	{
		H->SetActorLocation(FMath::Lerp(GetActorLocation(), Tip, Extend) + FVector(0.f, 0.f, -2.f));
	}
	if (Slither)
	{
		Slither->SetVolumeMultiplier(FMath::Clamp(LastTipSpeed / 300.f, 0.f, 1.f) * 0.5f * Extend);
	}
	Draw();
}
