#include "Stormworks/LighthouseBeam.h"

#include "Components/PointLightComponent.h"
#include "Components/SpotLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Stormworks/StormworksAssets.h"

ALighthouseBeam::ALighthouseBeam()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Turn = CreateDefaultSubobject<USceneComponent>(TEXT("Turn"));
	Turn->SetupAttachment(Root);
	Turn->SetMobility(EComponentMobility::Movable);

	Lens = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Lens"));
	Lens->SetupAttachment(Root);
	// Big enough to read as a point of light through the storm from two hundred metres.
	Lens->SetRelativeScale3D(FVector(3.2f));
	Lens->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Lens->SetCastShadow(false);

	for (int32 i = 0; i < 2; ++i)
	{
		USpotLightComponent* B = CreateDefaultSubobject<USpotLightComponent>(i == 0 ? TEXT("BeamA") : TEXT("BeamB"));
		B->SetupAttachment(Turn);
		B->SetMobility(EComponentMobility::Movable);
		B->SetRelativeRotation(FRotator(-3.f, i == 0 ? 0.f : 180.f, 0.f));
		B->SetIntensityUnits(ELightUnits::Unitless);
		B->SetIntensity(9.0e6f);
		B->SetAttenuationRadius(60000.f);
		B->SetInnerConeAngle(1.5f);
		B->SetOuterConeAngle(4.5f);
		B->SetLightColor(FLinearColor(1.f, 0.86f, 0.62f));
		B->SetCastShadows(false);
		B->SetVolumetricScatteringIntensity(3.f);
		(i == 0 ? BeamA : BeamB) = B;
	}

	Lamp = CreateDefaultSubobject<UPointLightComponent>(TEXT("Lamp"));
	Lamp->SetupAttachment(Root);
	Lamp->SetIntensityUnits(ELightUnits::Unitless);
	Lamp->SetIntensity(2.0e5f);
	Lamp->SetAttenuationRadius(4000.f);
	Lamp->SetLightColor(FLinearColor(1.f, 0.8f, 0.55f));
	Lamp->SetCastShadows(false);
}

void ALighthouseBeam::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Lens->SetStaticMesh(Stormworks::Mesh(TEXT("Sphere")));
	Lens->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_LampGlow")));
}

void ALighthouseBeam::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Turn->AddRelativeRotation(FRotator(0.f, DegreesPerSecond * DeltaSeconds, 0.f));
}
