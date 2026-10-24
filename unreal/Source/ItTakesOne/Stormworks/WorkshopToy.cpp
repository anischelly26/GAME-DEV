#include "Stormworks/WorkshopToy.h"

#include "Components/StaticMeshComponent.h"
#include "ItTakesOne.h"
#include "Stormworks/StormEase.h"
#include "Stormworks/StormworksAssets.h"

namespace
{
	constexpr float WindTime = 0.45f;
	constexpr float RunTime = 0.9f;
	constexpr float SettleTime = 1.4f;

	UStaticMeshComponent* Part(AActor* Owner, USceneComponent* Parent, const TCHAR* Name, const FVector& At, const FVector& Size)
	{
		UStaticMeshComponent* M = Owner->CreateDefaultSubobject<UStaticMeshComponent>(Name);
		M->SetupAttachment(Parent);
		M->SetRelativeLocation(At);
		M->SetRelativeScale3D(Size / 100.f);
		M->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return M;
	}
}

AWorkshopToy::AWorkshopToy()
{
	PrimaryActorTick.bCanEverTick = true;
	Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	SetRootComponent(Root);
	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	Pivot->SetupAttachment(Root);
	Pivot->SetMobility(EComponentMobility::Movable);
	// A tin boat about 30 cm long, pivoting about its rear axle.
	Hull = Part(this, Pivot, TEXT("Hull"), FVector(14.f, 0.f, 3.5f), FVector(30.f, 13.f, 7.f));
	Cabin = Part(this, Pivot, TEXT("Cabin"), FVector(9.f, 0.f, 10.5f), FVector(11.f, 10.f, 7.f));
	Funnel = Part(this, Pivot, TEXT("Funnel"), FVector(18.f, 0.f, 12.f), FVector(5.f, 5.f, 10.f));
	Key = Part(this, Pivot, TEXT("Key"), FVector(-2.f, 0.f, 8.f), FVector(1.f, 8.f, 4.f));
}

void AWorkshopToy::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	Hull->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Cabin->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Funnel->SetStaticMesh(Stormworks::Mesh(TEXT("Cylinder")));
	Key->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	Hull->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Brass")));
	Cabin->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Paper")));
	Funnel->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_ToyRed")));
	Key->SetMaterial(0, Stormworks::Material(TEXT("MI_TOS_Iron")));
}

bool AWorkshopToy::Play()
{
	if (IsPlaying())
	{
		return false;
	}
	T = 0.f;
	From = Offset;
	Clicks = 0;
	bRolled = false;
	return true;
}

void AWorkshopToy::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (T < 0.f)
	{
		return;
	}
	T += DeltaSeconds;
	float Lean = 0.f;
	float KeySpin = 0.f;
	if (T < WindTime)
	{
		// Anticipation: the key turns three clicks and it rears back on its tail.
		const float U = T / WindTime;
		Lean = 6.f * StormEase::InOut(U);
		KeySpin = 720.f * StormEase::InOut(U);
		while (Clicks < 3 && T >= 0.08f + 0.13f * Clicks)
		{
			Stormworks::Sound(this, TEXT("SFX_Click"), Key->GetComponentLocation(), 0.3f, 1.25f + 0.1f * Clicks);
			++Clicks;
		}
	}
	else if (T < WindTime + RunTime)
	{
		// Action: it lunges forward and rolls along the bench, easing to a stop.
		const float U = (T - WindTime) / RunTime;
		if (!bRolled)
		{
			bRolled = true;
			LastTin = Stormworks::Variant(5, LastTin);
			Stormworks::Sound(this, *FString::Printf(TEXT("SFX_Tin_%d"), LastTin), Hull->GetComponentLocation(), 0.35f, 1.3f);
		}
		Offset = From + Dir * Travel * StormEase::Out(U);
		Lean = FMath::Lerp(6.f, -5.f, StormEase::InOut(U / 0.17f));
		KeySpin = 720.f + 540.f * StormEase::Out(U);
	}
	else if (T < WindTime + RunTime + SettleTime)
	{
		// Settle: it rocks on its wheels and comes to rest.
		Offset = From + Dir * Travel;
		Lean = StormEase::Settle(T - WindTime - RunTime, -5.f, 2.2f, 3.f);
		KeySpin = 1260.f;
	}
	else
	{
		Offset = From + Dir * Travel;
		T = -1.f;
		Dir = -Dir;
		++Plays;
		UE_LOG(LogStormworks, Log, TEXT("Toy: run %d done, at %.0f cm"), Plays, Offset);
	}
	Pivot->SetRelativeLocation(FVector(Offset, 0.f, 0.f));
	Pivot->SetRelativeRotation(FRotator(Lean * Dir, 0.f, 0.f));
	Key->SetRelativeRotation(FRotator(0.f, 0.f, KeySpin));
}
