#include "Stormworks/TetherMovable.h"

#include "Components/AudioComponent.h"
#include "Components/StaticMeshComponent.h"
#include "ItTakesOne.h"
#include "Stormworks/StormworksAssets.h"

ATetherMovable::ATetherMovable()
{
	PrimaryActorTick.bCanEverTick = true;

	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);

	Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(Root);
	Body->SetMobility(EComponentMobility::Movable);
	Body->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);

	Rail = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Rail"));
	Rail->SetupAttachment(Root);
	Rail->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
}

void ATetherMovable::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Body->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Body->SetMaterial(0, Stormworks::Material(*BodyMaterial.ToString()));
	Body->SetRelativeScale3D(BodySize / 100.f);

	Rail->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Rail->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Iron")));
	Rail->SetVisibility(bShowRail);
	// The track is scenery: if it were solid, a fall into a gap could land on a girder with no way
	// up and no way down.
	Rail->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (bShowRail && !TrackEnd.IsNearlyZero())
	{
		// A girder under the body's path, running a little past both ends.
		const FVector Dir = TrackEnd.GetSafeNormal();
		const float Len = TrackEnd.Size() + FMath::Max(BodySize.X, BodySize.Y);
		Rail->SetRelativeLocation(TrackEnd * 0.5f - FVector(0.f, 0.f, RailDrop));
		Rail->SetRelativeRotation(Dir.Rotation());
		Rail->SetRelativeScale3D(FVector(Len / 100.f, 0.35f, 0.3f));
	}
	Apply();
}

bool ATetherMovable::Tug()
{
	if (IsMoving() || (bOneWay && Alpha > 0.999f))
	{
		return false;
	}
	From = Alpha;
	To = Alpha > 0.5f ? 0.f : 1.f;
	MoveT = 0.f;
	MoveDuration = FMath::Max(0.6f, TrackEnd.Size() / FMath::Max(1.f, Speed));
	if (MoveAudio)
	{
		MoveAudio->Stop();
	}
	MoveAudio = Stormworks::SoundAttached(Body, *MoveSound.ToString(), 0.9f, FMath::FRandRange(0.95f, 1.05f));
	UE_LOG(LogStormworks, Log, TEXT("%s: tugged, running %.0f -> %.0f over %.2f s"), *GetName(), From, To, MoveDuration);
	return true;
}

void ATetherMovable::ResetToStart()
{
	if (MoveAudio)
	{
		MoveAudio->Stop();
		MoveAudio = nullptr;
	}
	MoveT = -1.f;
	Alpha = 0.f;
	Apply();
}

void ATetherMovable::Apply()
{
	Body->SetRelativeLocation(TrackEnd * Alpha);
}

void ATetherMovable::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (MoveT < 0.f)
	{
		return;
	}
	MoveT += DeltaSeconds;
	const float K = FMath::Clamp(MoveT / MoveDuration, 0.f, 1.f);
	Alpha = FMath::Lerp(From, To, K * K * (3.f - 2.f * K));
	Apply();
	if (K >= 1.f)
	{
		MoveT = -1.f;
		Alpha = To;
		Apply();
		++Arrivals;
		if (MoveAudio)
		{
			MoveAudio->FadeOut(0.15f, 0.f);
			MoveAudio = nullptr;
		}
		// The stop: a recorded heavy metal impact under the synthesised clunk.
		LastClunk = Stormworks::Variant(5, LastClunk);
		Stormworks::Sound(this, *FString::Printf(TEXT("SFX_MetalHeavy_%d"), LastClunk), Body->GetComponentLocation(), 0.8f, FMath::FRandRange(0.9f, 1.05f));
		Stormworks::Sound(this, TEXT("S_TOS_Clunk"), Body->GetComponentLocation(), 0.6f, FMath::FRandRange(0.9f, 1.05f));
		OnArrived.Broadcast(this);
	}
}
