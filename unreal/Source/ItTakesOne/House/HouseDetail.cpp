#include "House/HouseDetail.h"

#include "Camera/PlayerCameraManager.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInterface.h"
#include "Stormworks/StormEase.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	UMaterialInterface* HouseMaterial(const TCHAR* Name)
	{
		UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, *FString::Printf(TEXT("/Game/ItTakesOne/House/Materials/%s.%s"), Name, Name), nullptr, LOAD_NoWarn | LOAD_Quiet);
		return M ? M : Stormworks::Material(TEXT("MI_TOS_Paper"));
	}

	UStaticMeshComponent* Part(AActor* Owner, USceneComponent* Parent, const TCHAR* Name)
	{
		UStaticMeshComponent* M = Owner->CreateDefaultSubobject<UStaticMeshComponent>(Name);
		M->SetupAttachment(Parent);
		M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		M->SetMobility(EComponentMobility::Movable);
		return M;
	}

	void Shape(UStaticMeshComponent* C, const TCHAR* Mesh, const FVector& At, const FVector& SizeCm, UMaterialInterface* Mat, const FRotator& Rot = FRotator::ZeroRotator)
	{
		C->SetStaticMesh(Stormworks::Mesh(Mesh));
		C->SetMaterial(0, Mat);
		C->SetRelativeLocationAndRotation(At, Rot);
		C->SetRelativeScale3D(SizeCm / 100.f);
	}

	constexpr int32 NumPuffs = 6;
}

AHouseDetail::AHouseDetail()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	PartA = Part(this, Root, TEXT("PartA"));
	PartB = Part(this, Root, TEXT("PartB"));
	PartC = Part(this, Root, TEXT("PartC"));
	Label = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Label"));
	Label->SetupAttachment(Root);
	Glint = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glint"));
	Glint->SetupAttachment(Root);
	Glint->SetRelativeLocation(FVector(0.f, 0.f, 20.f));
	Glint->SetIntensityUnits(ELightUnits::Unitless);
	Glint->SetIntensity(3500.f);
	Glint->SetAttenuationRadius(650.f);
	Glint->SetLightColor(FLinearColor(1.f, 0.72f, 0.36f));
	Glint->SetCastShadows(false);
	Glint->SetVolumetricScatteringIntensity(0.f);
	Glint->SetVisibility(false);
	for (int32 i = 0; i < NumPuffs; ++i)
	{
		UStaticMeshComponent* P = Part(this, Root, *FString::Printf(TEXT("Puff_%d"), i));
		P->SetCastShadow(false);
		Puffs.Add(P);
	}
}

void AHouseDetail::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Label->SetVisibility(false);
	for (UStaticMeshComponent* P : Puffs)
	{
		P->SetVisibility(false);
	}
	switch (Kind)
	{
	case EHouseDetailKind::Gauge:
		// A brass pressure gauge lying face up: body, paper dial, needle.
		Shape(PartA, TEXT("Cylinder"), FVector(0.f, 0.f, 2.5f), FVector(16.f, 16.f, 5.f), Stormworks::Material(TEXT("MI_TOS_Brass")));
		Shape(PartB, TEXT("Cylinder"), FVector(0.f, 0.f, 5.1f), FVector(13.f, 13.f, 0.4f), Stormworks::Material(TEXT("MI_TOS_Paper")));
		Shape(PartC, TEXT("Cube"), FVector(0.f, 0.f, 5.6f), FVector(0.8f, 6.f, 0.4f), Stormworks::Material(TEXT("MI_TOS_Iron")));
		break;
	case EHouseDetailKind::Kettle:
		Shape(PartA, TEXT("Cylinder"), FVector(0.f, 0.f, 8.f), FVector(20.f, 20.f, 16.f), Stormworks::Material(TEXT("MI_TOS_Iron")));
		Shape(PartB, TEXT("Cube"), FVector(13.f, 0.f, 12.f), FVector(12.f, 3.f, 3.f), Stormworks::Material(TEXT("MI_TOS_Iron")), FRotator(30.f, 0.f, 0.f));
		Shape(PartC, TEXT("Sphere"), FVector(0.f, 0.f, 17.f), FVector(4.f, 4.f, 4.f), Stormworks::Material(TEXT("MI_TOS_Brass")));
		for (UStaticMeshComponent* P : Puffs)
		{
			Shape(P, TEXT("Sphere"), FVector(18.f, 0.f, 16.f), FVector(4.f), HouseMaterial(TEXT("MI_House_Steam")));
			P->SetVisibility(true);
		}
		break;
	case EHouseDetailKind::HeightMarks:
		// Pencil lines up a doorframe, in Ivo's hand.
		PartA->SetStaticMesh(nullptr);
		PartB->SetStaticMesh(nullptr);
		PartC->SetStaticMesh(nullptr);
		Label->SetVisibility(true);
		Label->SetText(FText::FromString(TEXT("- M. 10\n\n\n- M. 8\n\n\n- M. 6")));
		Label->SetWorldSize(7.f);
		Label->SetTextRenderColor(FColor(40, 36, 32));
		Label->SetHorizontalAlignment(EHTA_Left);
		break;
	case EHouseDetailKind::WaterGlass:
		Shape(PartA, TEXT("Cylinder"), FVector(0.f, 0.f, 6.f), FVector(8.f, 8.f, 12.f), HouseMaterial(TEXT("MI_House_Glass")));
		Shape(PartB, TEXT("Cylinder"), FVector(0.f, 0.f, 3.f), FVector(7.f, 7.f, 6.f), HouseMaterial(TEXT("MI_House_Water")));
		Shape(PartC, TEXT("Cylinder"), FVector(3.f, 0.f, 6.f), FVector(1.4f, 1.4f, 0.f), HouseMaterial(TEXT("MI_House_Water")));
		for (int32 i = 0; i < 3; ++i)
		{
			Shape(Puffs[i], TEXT("Sphere"), FVector(4.f, 0.f, 12.f), FVector(1.6f), HouseMaterial(TEXT("MI_House_Water")));
		}
		break;
	}
}

void AHouseDetail::SetGlint(bool bOn)
{
	Glint->SetVisibility(bOn);
}

bool AHouseDetail::IsLookedAtBy(const APlayerController* PC, float MaxDegrees) const
{
	const APawn* P = PC ? PC->GetPawn() : nullptr;
	if (!P || !PC->PlayerCameraManager || FVector::Dist(P->GetActorLocation(), GetActorLocation()) > Reach)
	{
		return false;
	}
	const FVector View = PC->PlayerCameraManager->GetCameraRotation().Vector();
	const FVector To = (GetActorLocation() - PC->PlayerCameraManager->GetCameraLocation()).GetSafeNormal();
	return FVector::DotProduct(View, To) > FMath::Cos(FMath::DegreesToRadians(MaxDegrees));
}

void AHouseDetail::Play()
{
	if (bPlayed)
	{
		return;
	}
	bPlayed = true;
	T = 0.f;
}

void AHouseDetail::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	if (T >= 0.f)
	{
		T += DeltaSeconds;
	}
	// The drain's direction, flat, in the actor's frame.
	FVector ToDrain = GetActorTransform().InverseTransformVectorNoScale(DrainLocation - GetActorLocation());
	ToDrain.Z = 0.f;
	ToDrain = ToDrain.GetSafeNormal();
	if (ToDrain.IsNearlyZero())
	{
		ToDrain = FVector::ForwardVector;
	}

	switch (Kind)
	{
	case EHouseDetailKind::Gauge:
	{
		Needle = FMath::FInterpTo(Needle, NeedleWant, DeltaSeconds, 5.f);
		const float Twitch = Needle > 0.05f ? FMath::Sin(Time * 31.f) * 6.f * (1.f - Needle) : 0.f;
		PartC->SetRelativeRotation(FRotator(0.f, -40.f + 170.f * Needle + Twitch, 0.f));
		break;
	}
	case EHouseDetailKind::Kettle:
	{
		// Steam rises and drifts... until the drain takes an interest: then it all leans that way.
		const float Sniff = T < 0.f ? 0.f : T < 0.6f ? StormEase::InOut(T / 0.6f) : T < 3.2f ? 1.f : FMath::Max(0.f, 1.f - (T - 3.2f) / 1.5f);
		for (int32 i = 0; i < Puffs.Num(); ++i)
		{
			const float Life = FMath::Fmod(Time * 0.55f + i / static_cast<float>(Puffs.Num()), 1.f);
			const FVector Up(0.f, FMath::Sin(Time * 1.3f + i) * 3.f, 50.f * Life);
			const FVector Side = ToDrain * 60.f * Life + FVector(0.f, 0.f, -35.f * Life);
			Puffs[i]->SetRelativeLocation(FVector(18.f, 0.f, 16.f) + FMath::Lerp(Up, Side, Sniff));
			Puffs[i]->SetRelativeScale3D(FVector(0.03f + 0.09f * Life) * (1.f - Life * 0.4f));
		}
		break;
	}
	case EHouseDetailKind::WaterGlass:
	{
		if (T < 0.f)
		{
			break;
		}
		// The water leans toward the drain and rises, a tongue of it climbs the side and over the
		// rim, a few drops run off toward the drain... then it is a glass of water again.
		const float Settle = T > 2.8f ? FMath::Max(0.f, 1.f - (T - 2.8f) / 1.4f) : 1.f;
		const float Lean = StormEase::InOut(T / 0.8f) * Settle;
		const FRotator Toward = ToDrain.Rotation();
		PartB->SetRelativeRotation(FRotator(0.f, Toward.Yaw, 0.f) + FRotator(-14.f * Lean, 0.f, 0.f));
		PartB->SetRelativeScale3D(FVector(0.07f, 0.07f, 0.06f + 0.025f * Lean));
		const float Climb = StormEase::Out((T - 0.6f) / 1.f) * Settle;
		PartC->SetRelativeLocation(ToDrain * 3.f + FVector(0.f, 0.f, 6.f + 4.f * Climb));
		PartC->SetRelativeScale3D(FVector(0.014f, 0.014f, 0.08f * Climb));
		for (int32 i = 0; i < 3; ++i)
		{
			const float D = FMath::Clamp((T - 1.3f - i * 0.25f) / 0.9f, 0.f, 1.f);
			Puffs[i]->SetVisibility(D > 0.f && D < 1.f);
			const float Arc = FMath::Sin(D * PI) * 4.f;
			Puffs[i]->SetRelativeLocation(ToDrain * (4.f + 26.f * D) + FVector(0.f, 0.f, 12.f - 12.f * D + Arc));
		}
		break;
	}
	default:
		break;
	}
}
