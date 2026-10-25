#include "Stormworks/MaraFace.h"

#include "AnimationRuntime.h"
#include "CableComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "EngineUtils.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "ItTakesOne.h"
#include "Stormworks/CollapsingWalkway.h"
#include "Stormworks/LighthouseBeam.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormDirector.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/StoryNote.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/TetherMovable.h"
#include "Stormworks/TetherPoint.h"
#include "Stormworks/WorkshopToy.h"

namespace
{
	/** How far the lids travel to close from their open pose (radians, the web game's). */
	constexpr float LidShut = 2.22f;

	float FaceDamp(float From, float To, float Rate, float Dt)
	{
		return FMath::Lerp(To, From, FMath::Exp(-Rate * Dt));
	}

	FTransform BoneRef(const USkeletalMeshComponent* Body, FName Bone)
	{
		const FReferenceSkeleton& Ref = Body->GetSkeletalMeshAsset()->GetRefSkeleton();
		const int32 Index = Ref.FindBoneIndex(Bone);
		return Index == INDEX_NONE ? FTransform::Identity : FAnimationRuntime::GetComponentSpaceTransformRefPose(Ref, Index);
	}
}

UMaraFace::UMaraFace()
{
	PrimaryComponentTick.bCanEverTick = true;
}

USceneComponent* UMaraFace::MakePivot(USkeletalMeshComponent* Body, FName Bone, const FVector& ModelCenter, const TCHAR* Name)
{
	// A fixed base on the bone at the part's centre (in her bind pose), and a child that turns.
	USceneComponent* Base = NewObject<USceneComponent>(GetOwner(), *FString::Printf(TEXT("%s_Base"), Name));
	Base->SetupAttachment(Body, Bone);
	Base->SetRelativeTransform(FTransform(ModelCenter) * BoneRef(Body, Bone).Inverse());
	Base->RegisterComponent();
	USceneComponent* Turn = NewObject<USceneComponent>(GetOwner(), Name);
	Turn->SetupAttachment(Base);
	Turn->RegisterComponent();
	return Turn;
}

void UMaraFace::Hang(UStaticMeshComponent* Part, USceneComponent* Pivot, const FVector& ModelCenter)
{
	// Its geometry is in her bind pose: relative to a pivot at ModelCenter it sits at -ModelCenter.
	Part->AttachToComponent(Pivot, FAttachmentTransformRules::KeepRelativeTransform);
	Part->SetRelativeTransform(FTransform(-ModelCenter));
}

bool UMaraFace::Setup(USkeletalMeshComponent* Body, const TArray<UStaticMeshComponent*>& RigidParts)
{
	struct FPart
	{
		UStaticMeshComponent* C;
		FVector Center;
		FVector Extent;
	};
	TArray<FPart> Head, Neck;
	for (UStaticMeshComponent* P : RigidParts)
	{
		if (!P || !P->GetStaticMesh())
		{
			continue;
		}
		const FBoxSphereBounds B = P->GetStaticMesh()->GetBounds();
		const FName Bone = P->GetAttachSocketName();
		if (Bone == TEXT("head"))
		{
			Head.Add({P, B.Origin, B.BoxExtent});
		}
		else if (Bone == TEXT("neck_01"))
		{
			Neck.Add({P, B.Origin, B.BoxExtent});
		}
	}

	// Eyes: the two spheres.
	TArray<FPart> EyeParts = Head.FilterByPredicate([](const FPart& P) { return P.Extent.GetMin() > 4.f && P.Extent.GetMax() - P.Extent.GetMin() < 0.8f; });
	EyeParts.Sort([](const FPart& A, const FPart& B) { return A.Center.X < B.Center.X; });
	for (int32 i = 0; i < EyeParts.Num(); ++i)
	{
		FEye E;
		E.Center = EyeParts[i].Center;
		E.Ball = MakePivot(Body, TEXT("head"), E.Center, *FString::Printf(TEXT("MaraEye_%d"), i));
		E.Lid = MakePivot(Body, TEXT("head"), E.Center, *FString::Printf(TEXT("MaraLid_%d"), i));
		Hang(EyeParts[i].C, E.Ball, E.Center);
		EyesList.Add(E);
	}
	for (const FPart& P : Head)
	{
		if (EyeParts.ContainsByPredicate([&P](const FPart& E) { return E.C == P.C; }) || EyesList.Num() == 0)
		{
			continue;
		}
		FEye* Near = &EyesList[0];
		for (FEye& E : EyesList)
		{
			if (FMath::Abs(E.Center.X - P.Center.X) < FMath::Abs(Near->Center.X - P.Center.X))
			{
				Near = &E;
			}
		}
		if (P.Extent.GetMax() < 1.5f)
		{
			Near->Glint = P.C;
		}
		else if (P.Center.Z > Near->Center.Z + 4.f)
		{
			FBrow Brow;
			Brow.Pivot = MakePivot(Body, TEXT("head"), P.Center, *FString::Printf(TEXT("MaraBrow_%d"), Brows.Num()));
			// Which way to roll so the inner end (towards the nose) goes down.
			const FVector Inner(P.Center.X > 0.f ? -P.Extent.X : P.Extent.X, 0.f, 0.f);
			Brow.Side = FQuat(FVector::YAxisVector, 0.3f).RotateVector(Inner).Z < 0.f ? 1.f : -1.f;
			Hang(P.C, Brow.Pivot, P.Center);
			Brows.Add(Brow);
		}
		else if (P.Center.Z > Near->Center.Z - 7.f)
		{
			// The lid and its lash line close together about the eye's centre.
			Hang(P.C, Near->Lid, Near->Center);
			// Which way is "closing": the way that brings the lid forward over the eye (+Y, her face).
			const FVector Off = P.Center - Near->Center;
			LidSign = FQuat(FVector::XAxisVector, 0.5f).RotateVector(Off).Y > Off.Y ? 1.f : -1.f;
		}
	}
	Eyes = EyesList.Num();

	// The scarf's tails, from its knot (the smallest part on the neck).
	if (Neck.Num() > 0)
	{
		Neck.Sort([](const FPart& A, const FPart& B) { return A.Extent.Size() < B.Extent.Size(); });
		const FPart& Knot = Neck[0];
		const FTransform NeckRef = BoneRef(Body, TEXT("neck_01"));
		for (int32 i = 0; i < 2; ++i)
		{
			UCableComponent* Tail = NewObject<UCableComponent>(GetOwner(), *FString::Printf(TEXT("MaraScarfTail_%d"), i));
			Tail->SetupAttachment(Body, TEXT("neck_01"));
			Tail->SetRelativeLocation(NeckRef.InverseTransformPosition(Knot.Center + FVector(i == 0 ? -1.5f : 1.5f, 0.f, -2.f)));
			Tail->bAttachEnd = false;
			Tail->CableLength = i == 0 ? 30.f : 36.f;
			Tail->NumSegments = 6;
			Tail->CableWidth = 4.5f;
			Tail->NumSides = 4;
			Tail->SolverIterations = 2;
			Tail->bEnableStiffness = true;
			Tail->CableGravityScale = 1.f;
			Tail->SetCastShadow(false);
			Tail->SetMaterial(0, Knot.C->GetMaterial(0));
			Tail->RegisterComponent();
			ScarfTails.Add(Tail);
		}
		Tails = ScarfTails.Num();
	}
	UE_LOG(LogStormworks, Log, TEXT("Mara's face: %d eyes, %d brows, lids close %s, %d scarf tails"), Eyes, Brows.Num(), LidSign > 0.f ? TEXT("+X") : TEXT("-X"), Tails);
	return Eyes == 2;
}

EMaraMood UMaraFace::ChooseMood() const
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	const AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>();
	if (!C || !GM)
	{
		return EMaraMood::Neutral;
	}
	const UTetherComponent* T = C->FindComponentByClass<UTetherComponent>();
	const bool bCarried = T && T->GetState() == ETetherState::Reeling;
	if ((GM->Cinema && GM->Cinema->IsPlaying(EStormShot::EngineReveal)) || (!bCarried && C->GetVelocity().Z < -700.f))
	{
		return EMaraMood::Surprised;
	}
	const AStormDirector* D = GM->GetDirector();
	if ((T && (T->GetState() == ETetherState::Pulling || bCarried)) || (D && D->Walkway && D->Walkway->bRunning))
	{
		return EMaraMood::Determined;
	}
	const AWorkshopToy* Toy = GM->ToyInReach(C);
	if (GM->bComplete || (GM->Cinema && GM->Cinema->IsPlaying(EStormShot::Rooftop)) || (Toy && Toy->IsPlaying()))
	{
		return EMaraMood::Happy;
	}
	return EMaraMood::Neutral;
}

bool UMaraFace::ChooseLookTarget(FVector& Out) const
{
	const ACharacter* C = Cast<ACharacter>(GetOwner());
	const AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>();
	if (!C || !GM)
	{
		return false;
	}
	if (GM->Cinema && (GM->Cinema->IsPlaying(EStormShot::Opening) || GM->Cinema->IsPlaying(EStormShot::Rooftop)))
	{
		// The light on Knoll Rock.
		for (TActorIterator<ALighthouseBeam> It(GetWorld()); It; ++It)
		{
			Out = It->GetActorLocation();
			return true;
		}
	}
	if (GM->Cinema && GM->Cinema->IsPlaying(EStormShot::EngineReveal))
	{
		if (const AStormDirector* D = GM->GetDirector(); D && D->Gate)
		{
			Out = D->Gate->GetActorLocation();
			return true;
		}
	}
	if (const UTetherComponent* T = C->FindComponentByClass<UTetherComponent>())
	{
		const ATetherPoint* P = T->GetAttached() ? T->GetAttached() : T->GetTarget() ? T->GetTarget() : T->GetOutOfReach();
		if (P)
		{
			Out = P->GetAttachLocation();
			return true;
		}
	}
	if (const AStoryNote* Note = GM->NoteInReach(C))
	{
		Out = Note->GetActorLocation();
		return true;
	}
	if (const AWorkshopToy* Toy = GM->ToyInReach(C))
	{
		Out = Toy->GetActorLocation();
		return true;
	}
	return false;
}

void UMaraFace::TickComponent(float DeltaTime, ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);
	if (EyesList.Num() == 0)
	{
		return;
	}
	const float Dt = FMath::Min(DeltaTime, 0.1f);
	Time += Dt;
	Mood = ChooseMood();
	MoodsSeen |= 1 << static_cast<int32>(Mood);

	// --- where the eyes look: something that matters, or little glances about
	FVector Target;
	bLooking = ChooseLookTarget(Target);
	FVector2D Want = Wander;
	NextWander -= Dt;
	if (NextWander <= 0.f)
	{
		Wander = FVector2D(FMath::FRandRange(-0.25f, 0.25f), FMath::FRandRange(-0.12f, 0.12f));
		NextWander = FMath::FRandRange(0.8f, 3.0f);
	}
	if (bLooking)
	{
		// In the eyes' own frame (her bind pose, moving with the head): +Y is straight ahead.
		const FEye& E = EyesList[0];
		const USceneComponent* Base = E.Ball->GetAttachParent();
		const FVector Mid = (EyesList[0].Ball->GetComponentLocation() + EyesList.Last().Ball->GetComponentLocation()) * 0.5f;
		const FVector L = Base->GetComponentTransform().InverseTransformVectorNoScale(Target - Mid);
		Want = FVector2D(FMath::Atan2(L.X, L.Y), FMath::Atan2(L.Z, FVector2D(L.X, L.Y).Size()));
	}
	Want.X = FMath::Clamp(Want.X, -0.5f, 0.5f);
	Want.Y = FMath::Clamp(Want.Y, -0.3f, 0.3f);
	Look.X = FaceDamp(Look.X, Want.X, 18.f, Dt);
	Look.Y = FaceDamp(Look.Y, Want.Y, 18.f, Dt);
	const FVector Dir(FMath::Sin(Look.X) * FMath::Cos(Look.Y), FMath::Cos(Look.X) * FMath::Cos(Look.Y), FMath::Sin(Look.Y));
	const FQuat EyeTurn = FQuat::FindBetweenNormals(FVector::YAxisVector, Dir.GetSafeNormal());

	// --- blinks every few seconds; lids set by the mood, following the eyes up and down a little
	NextBlink -= Dt;
	if (NextBlink <= 0.f)
	{
		Blink = 1.f;
		NextBlink = FMath::FRandRange(2.2f, 5.7f);
	}
	if (Blink >= 1.f)
	{
		++Blinks;
	}
	Blink = FMath::Max(0.f, Blink - Dt * 7.f);
	const float BlinkClose = Blink > 0.f ? FMath::Sin(Blink * PI) : 0.f;
	const float Open = Mood == EMaraMood::Surprised ? -0.28f : Mood == EMaraMood::Happy ? 0.30f : Mood == EMaraMood::Determined ? 0.37f : 0.f;
	const float LidWant = FMath::Lerp(Open, LidShut, ForceClosure >= 0.f ? ForceClosure : BlinkClose);
	Lid = FaceDamp(Lid, LidWant, BlinkClose > 0.f || ForceClosure >= 0.f ? 40.f : 14.f, Dt);
	Closure = FMath::Clamp(Lid / LidShut, 0.f, 1.f);
	const FQuat LidTurn(FVector::XAxisVector, LidSign * (Lid - Look.Y * 0.3f));
	for (FEye& E : EyesList)
	{
		E.Ball->SetRelativeRotation(EyeTurn);
		E.Lid->SetRelativeRotation(LidTurn);
		if (E.Glint)
		{
			// The catch-lights go when the lids come down over them.
			E.Glint->SetVisibility(Closure < 0.45f);
		}
	}

	// --- brows: up when surprised or happy, down and in when determined
	const float Lift = Mood == EMaraMood::Surprised ? 2.2f : Mood == EMaraMood::Happy ? 0.8f : Mood == EMaraMood::Determined ? -0.8f : 0.f;
	const float Tilt = Mood == EMaraMood::Determined ? 0.32f : 0.f;
	BrowLift = FaceDamp(BrowLift, Lift, 12.f, Dt);
	BrowTilt = FaceDamp(BrowTilt, Tilt, 12.f, Dt);
	for (const FBrow& B : Brows)
	{
		B.Pivot->SetRelativeLocation(FVector(0.f, 0.f, BrowLift));
		B.Pivot->SetRelativeRotation(FQuat(FVector::YAxisVector, B.Side * BrowTilt));
	}

	// --- the scarf's tails: the storm's wind, in gusts, on top of their own swing
	const FVector Wind = FVector(-350.f, 520.f, 0.f).GetSafeNormal();
	const FVector Side = FVector::CrossProduct(Wind, FVector::UpVector);
	for (int32 i = 0; i < ScarfTails.Num(); ++i)
	{
		const float Gust = 0.6f + 0.4f * FMath::Sin(Time * 1.7f + i * 1.3f);
		ScarfTails[i]->CableForce = Wind * 260.f * Gust + Side * 90.f * FMath::Sin(Time * 6.f + i * 2.1f);
	}
}
