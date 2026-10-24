#include "Stormworks/StoryNote.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/TextRenderComponent.h"
#include "Stormworks/StormworksAssets.h"

AStoryNote::AStoryNote()
{
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	// A sheet pinned flat against a wall; the actor's forward (X) axis points out of the wall.
	Paper = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Paper"));
	Paper->SetupAttachment(Root);
	Paper->SetRelativeScale3D(FVector(0.01f, 0.3f, 0.4f));
	Paper->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	// "IV" chalked on the wall beside it.
	Chalk = CreateDefaultSubobject<UTextRenderComponent>(TEXT("Chalk"));
	Chalk->SetupAttachment(Root);
	Chalk->SetRelativeLocation(FVector(1.5f, 48.f, 10.f));
	Chalk->SetHorizontalAlignment(EHTA_Center);
	Chalk->SetVerticalAlignment(EVRTA_TextCenter);
	Chalk->SetWorldSize(46.f);
	Chalk->SetTextRenderColor(FColor(235, 232, 220));

	Lamp = CreateDefaultSubobject<UPointLightComponent>(TEXT("Lamp"));
	Lamp->SetupAttachment(Root);
	Lamp->SetRelativeLocation(FVector(60.f, 0.f, 60.f));
	Lamp->SetIntensity(1500.f);
	Lamp->SetAttenuationRadius(320.f);
	Lamp->SetLightColor(FLinearColor(1.f, 0.72f, 0.42f));
	Lamp->SetCastShadows(false);
}

void AStoryNote::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Paper->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Paper->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Paper")));
	Chalk->SetText(FText::FromString(ChalkText));
	Chalk->SetVisibility(!ChalkText.IsEmpty());
}
