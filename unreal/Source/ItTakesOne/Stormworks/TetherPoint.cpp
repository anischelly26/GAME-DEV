#include "Stormworks/TetherPoint.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/TetherMovable.h"

ATetherPoint::ATetherPoint()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	// The ring faces along the actor's forward (X) axis: a flattened cylinder turned on its side.
	Ring = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Ring"));
	Ring->SetupAttachment(Root);
	Ring->SetRelativeRotation(FRotator(90.f, 0.f, 0.f));
	Ring->SetRelativeScale3D(FVector(0.55f, 0.55f, 0.07f));
	Ring->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Ring->SetCastShadow(false);

	Core = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Core"));
	Core->SetupAttachment(Root);
	Core->SetRelativeLocation(FVector(4.f, 0.f, 0.f));
	Core->SetRelativeScale3D(FVector(0.22f));
	Core->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Core->SetCastShadow(false);

	// A short arm back to whatever the ring is bolted to.
	Bracket = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Bracket"));
	Bracket->SetupAttachment(Root);
	Bracket->SetRelativeLocation(FVector(-18.f, 0.f, 0.f));
	Bracket->SetRelativeScale3D(FVector(0.36f, 0.08f, 0.08f));
	Bracket->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Root);
	Glow->SetRelativeLocation(FVector(30.f, 0.f, 0.f));
	Glow->SetAttenuationRadius(380.f);
	Glow->SetIntensity(400.f);
	Glow->SetLightColor(Stormworks::Accent());
	Glow->SetCastShadows(false);
}

void ATetherPoint::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Ring->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
	Ring->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Brass")));
	Core->SetStaticMesh(Stormworks::Mesh(TEXT("Sphere")));
	Core->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_TetherGlow")));
	Bracket->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Bracket->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Iron")));
}

void ATetherPoint::BeginPlay()
{
	Super::BeginPlay();
	CoreMID = Core->CreateDynamicMaterialInstance(0);
	if (Movable)
	{
		// Ride along with the machine.
		AttachToComponent(Movable->Body, FAttachmentTransformRules::KeepWorldTransform);
	}
	SetHighlight(0);
}

FVector ATetherPoint::GetAttachLocation() const
{
	return Core->GetComponentLocation();
}

FVector ATetherPoint::GetLandingLocation() const
{
	return GetActorTransform().TransformPositionNoScale(LandingOffset);
}

void ATetherPoint::SetHighlight(int32 Level)
{
	Highlight = Level;
}

void ATetherPoint::Pulse(float Strength)
{
	PulseAmount = FMath::Max(PulseAmount, Strength);
}

void ATetherPoint::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	PulseAmount = FMath::Max(0.f, PulseAmount - DeltaSeconds * 3.f);

	// Idle rings breathe gently so they read from a distance; the target glows steadily brighter.
	const float Breath = 0.5f + 0.5f * FMath::Sin(Time * 2.4f);
	float Want = 1.2f + 0.6f * Breath;
	if (!bEnabled)
	{
		Want = 0.15f;
	}
	else if (Highlight == 1)
	{
		Want = 0.8f;
	}
	else if (Highlight == 2)
	{
		Want = 5.f + 1.5f * Breath;
	}
	else if (Highlight == 3)
	{
		Want = 7.f;
	}
	Want += PulseAmount * 10.f;
	Shown = FMath::FInterpTo(Shown, Want, DeltaSeconds, 12.f);

	if (CoreMID)
	{
		CoreMID->SetScalarParameterValue(TEXT("EmissiveStrength"), Shown * 4.f);
	}
	Glow->SetIntensity(120.f + Shown * 260.f);
	Core->SetRelativeScale3D(FVector(0.22f * (1.f + 0.06f * (Highlight >= 2 ? Breath : 0.f) + 0.25f * PulseAmount)));
}
