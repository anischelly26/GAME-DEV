#include "Stormworks/TetherPickup.h"

#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Character.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/TetherComponent.h"

ATetherPickup::ATetherPickup()
{
	PrimaryActorTick.bCanEverTick = true;

	Trigger = CreateDefaultSubobject<USphereComponent>(TEXT("Trigger"));
	SetRootComponent(Trigger);
	Trigger->SetSphereRadius(150.f);
	Trigger->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Trigger->SetCollisionResponseToAllChannels(ECR_Ignore);
	Trigger->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);
	Trigger->SetGenerateOverlapEvents(true);

	Model = CreateDefaultSubobject<USceneComponent>(TEXT("Model"));
	Model->SetupAttachment(Trigger);

	// A brass canister with a coil of cable and a hook: the same brass and teal as every ring.
	Canister = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Canister"));
	Canister->SetupAttachment(Model);
	Canister->SetRelativeRotation(FRotator(0.f, 0.f, 90.f));
	Canister->SetRelativeScale3D(FVector(0.16f, 0.16f, 0.32f));
	Canister->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Coil = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Coil"));
	Coil->SetupAttachment(Model);
	Coil->SetRelativeLocation(FVector(0.f, 0.f, 4.f));
	Coil->SetRelativeRotation(FRotator(0.f, 0.f, 90.f));
	Coil->SetRelativeScale3D(FVector(0.2f, 0.2f, 0.12f));
	Coil->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Hook = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Hook"));
	Hook->SetupAttachment(Model);
	Hook->SetRelativeLocation(FVector(0.f, 22.f, 0.f));
	Hook->SetRelativeScale3D(FVector(0.08f));
	Hook->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Model);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, 40.f));
	Glow->SetIntensity(900.f);
	Glow->SetAttenuationRadius(300.f);
	Glow->SetLightColor(Stormworks::Accent());
	Glow->SetCastShadows(false);
}

void ATetherPickup::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Canister->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
	Canister->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Brass")));
	Coil->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
	Coil->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Cable")));
	Hook->SetStaticMesh(Stormworks::Mesh(TEXT("Sphere")));
	Hook->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_TetherGlow")));
}

void ATetherPickup::BeginPlay()
{
	Super::BeginPlay();
	Trigger->OnComponentBeginOverlap.AddDynamic(this, &ATetherPickup::OnEnter);
}

void ATetherPickup::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Time += DeltaSeconds;
	if (!bTaken)
	{
		Model->SetRelativeLocation(FVector(0.f, 0.f, 4.f * FMath::Sin(Time * 2.f)));
		Model->SetRelativeRotation(FRotator(0.f, Time * 30.f, 0.f));
	}
}

void ATetherPickup::OnEnter(UPrimitiveComponent* Overlapped, AActor* Other, UPrimitiveComponent* OtherComp, int32 BodyIndex, bool bFromSweep, const FHitResult& Sweep)
{
	if (bTaken)
	{
		return;
	}
	ACharacter* C = Cast<ACharacter>(Other);
	UTetherComponent* T = C ? C->FindComponentByClass<UTetherComponent>() : nullptr;
	if (!T)
	{
		return;
	}
	bTaken = true;
	T->GiveTether();
	Model->SetVisibility(false, true);
	Stormworks::Sound2D(this, TEXT("S_TOS_Pickup"), 0.9f);
	if (AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>())
	{
		GM->ShowMessage(TEXT("Ivo's maintenance tether. Aim at a brass ring: E / left mouse"), 4.5f);
		GM->SetObjective(Objective);
	}
}
