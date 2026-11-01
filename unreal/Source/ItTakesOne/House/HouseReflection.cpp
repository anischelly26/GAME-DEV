#include "House/HouseReflection.h"

#include "Components/PointLightComponent.h"
#include "Components/PoseableMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/Character.h"
#include "ItTakesOne.h"
#include "Kismet/GameplayStatics.h"
#include "Stormworks/StormworksAssets.h"

AHouseReflection::AHouseReflection()
{
	PrimaryActorTick.bCanEverTick = true;
	// After her animation has run this frame.
	PrimaryActorTick.TickGroup = TG_PostUpdateWork;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	Night = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Night"));
	Night->SetupAttachment(GetRootComponent());
	Night->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Night->SetCastShadow(false);
	Night->SetHiddenInGame(true);
}

void AHouseReflection::OnConstruction(const FTransform& Transform)
{
	Super::OnConstruction(Transform);
	// Six metres out beyond the glass (any farther and the fog greys it), wide and tall enough to fill
	// every view through the windows.
	Night->SetStaticMesh(Stormworks::Mesh(TEXT("Cube")));
	if (UMaterialInterface* M = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/ItTakesOne/House/Materials/MI_House_Night.MI_House_Night"), nullptr, LOAD_NoWarn | LOAD_Quiet))
	{
		Night->SetMaterial(0, M);
	}
	Night->SetWorldLocationAndRotation(FVector(150.f, MirrorY - 600.f, 450.f), FRotator::ZeroRotator);
	Night->SetWorldScale3D(FVector(36.f, 0.1f, 15.f));
}

void AHouseReflection::SetShown(bool bShow)
{
	if (bShow != bShown)
	{
		bShown = bShow;
		if (Pose)
		{
			Pose->SetVisibility(bShow, true);
		}
		Night->SetHiddenInGame(!bShow);
	}
}

void AHouseReflection::Lag(float Seconds, float Hold)
{
	DelayWant = FMath::Clamp(Seconds, 0.f, 1.8f);
	HoldLeft = Hold;
}

void AHouseReflection::Copy(USceneComponent* From, USceneComponent* To)
{
	for (USceneComponent* Child : From->GetAttachChildren())
	{
		if (!Child || !Child->IsVisible())
		{
			continue;
		}
		USceneComponent* Made = nullptr;
		if (USkeletalMeshComponent* Skel = Cast<USkeletalMeshComponent>(Child))
		{
			// Her outfit, hair and head follow the body's pose; here they follow the mirror's.
			USkeletalMeshComponent* Follower = NewObject<USkeletalMeshComponent>(this);
			Follower->SetSkinnedAssetAndUpdate(Skel->GetSkinnedAsset());
			for (int32 i = 0; i < Skel->GetNumMaterials(); ++i)
			{
				Follower->SetMaterial(i, Skel->GetMaterial(i));
			}
			Follower->SetLeaderPoseComponent(Pose);
			Made = Follower;
		}
		else if (UStaticMeshComponent* Mesh = Cast<UStaticMeshComponent>(Child))
		{
			UStaticMeshComponent* Part = NewObject<UStaticMeshComponent>(this);
			Part->SetStaticMesh(Mesh->GetStaticMesh());
			for (int32 i = 0; i < Mesh->GetNumMaterials(); ++i)
			{
				Part->SetMaterial(i, Mesh->GetMaterial(i));
			}
			Made = Part;
		}
		else if (Child->GetClass() == USceneComponent::StaticClass())
		{
			// The face's pivots: plain scene components holding her eyes and brows.
			Made = NewObject<USceneComponent>(this);
		}
		if (!Made)
		{
			continue;
		}
		if (UPrimitiveComponent* Prim = Cast<UPrimitiveComponent>(Made))
		{
			Prim->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Prim->SetCastShadow(false);
		}
		Made->SetupAttachment(To, Child->GetAttachSocketName());
		Made->SetRelativeTransform(Child->GetRelativeTransform());
		Made->RegisterComponent();
		Copy(Child, Made);
	}
}

bool AHouseReflection::Build()
{
	ACharacter* Mara = UGameplayStatics::GetPlayerCharacter(this, 0);
	USkeletalMeshComponent* Body = Mara ? Mara->GetMesh() : nullptr;
	if (!Body || !Body->GetSkinnedAsset() || Body->GetAttachChildren().Num() == 0)
	{
		return false;
	}
	Pose = NewObject<UPoseableMeshComponent>(this, TEXT("Pose"));
	Pose->SetupAttachment(GetRootComponent());
	Pose->SetSkinnedAssetAndUpdate(Body->GetSkinnedAsset());
	for (int32 i = 0; i < Body->GetNumMaterials(); ++i)
	{
		Pose->SetMaterial(i, Body->GetMaterial(i));
	}
	Pose->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Pose->SetCastShadow(false);
	Pose->RegisterComponent();
	Copy(Body, Pose);
	// The room's lamplight, as the glass would show it: a little warmth on her mirrored front.
	Glow = NewObject<UPointLightComponent>(this);
	Glow->SetupAttachment(Pose);
	Glow->SetRelativeLocation(FVector(0.f, 0.f, 100.f));
	Glow->SetIntensityUnits(ELightUnits::Unitless);
	Glow->SetIntensity(900.f);
	Glow->SetAttenuationRadius(220.f);
	Glow->SetLightColor(FLinearColor(1.f, 0.7f, 0.45f));
	Glow->SetCastShadows(false);
	Glow->SetVolumetricScatteringIntensity(0.f);
	Glow->RegisterComponent();
	Pose->SetVisibility(bShown, true);
	UE_LOG(LogStormworks, Log, TEXT("House: Mara's reflection built (%d parts)"), Pose->GetNumChildrenComponents());
	return true;
}

void AHouseReflection::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Clock += DeltaSeconds;
	if (!bBuilt)
	{
		bBuilt = Build();
		if (!bBuilt)
		{
			return;
		}
	}
	ACharacter* Mara = UGameplayStatics::GetPlayerCharacter(this, 0);
	USkeletalMeshComponent* Body = Mara ? Mara->GetMesh() : nullptr;
	if (!Body)
	{
		return;
	}
	// Remember her pose, every frame, for two seconds.
	FFrame& Now = Frames.AddDefaulted_GetRef();
	Now.Time = Clock;
	Now.Root = Body->GetComponentTransform();
	Now.Bones = Body->GetBoneSpaceTransforms();
	while (Frames.Num() > 2 && Clock - Frames[1].Time > 2.0)
	{
		Frames.RemoveAt(0, EAllowShrinking::No);
	}

	// Falling behind slows it almost to a stop; catching up plays it a little fast. Never backwards.
	HoldLeft -= DeltaSeconds;
	if (HoldLeft <= 0.f)
	{
		DelayWant = 0.f;
	}
	Delay = FMath::FInterpConstantTo(Delay, DelayWant, DeltaSeconds, DelayWant > Delay ? 0.85f : 0.35f);
	if (!bShown)
	{
		return;
	}
	const double Want = Clock - Delay;
	const FFrame* Use = &Frames[0];
	for (int32 i = Frames.Num() - 1; i >= 0; --i)
	{
		if (Frames[i].Time <= Want)
		{
			Use = &Frames[i];
			break;
		}
	}

	// Mirrored in the plane y = MirrorY: the position, the rotation (x and z components negated) and
	// a flip of the Y axis, so she is her own mirror image.
	FVector Location = Use->Root.GetLocation();
	Location.Y = 2.f * MirrorY - Location.Y;
	const FQuat Q = Use->Root.GetRotation();
	FVector Scale = Use->Root.GetScale3D();
	Scale.Y = -Scale.Y;
	Pose->SetWorldTransform(FTransform(FQuat(-Q.X, Q.Y, -Q.Z, Q.W), Location, Scale));
	if (Pose->BoneSpaceTransforms.Num() == Use->Bones.Num())
	{
		Pose->BoneSpaceTransforms = Use->Bones;
		Pose->MarkRefreshTransformDirty();
	}
}
