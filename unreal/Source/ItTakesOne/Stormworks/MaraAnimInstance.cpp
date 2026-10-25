#include "Stormworks/MaraAnimInstance.h"

#include "Animation/AnimInstanceProxy.h"
#include "Animation/AnimNodeBase.h"
#include "Animation/AnimSequence.h"
#include "AnimationRuntime.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Components/CapsuleComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/Character.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "ItTakesOne.h"
#include "Stormworks/MaraFace.h"
#include "Stormworks/TetherComponent.h"

namespace
{
	const TCHAR* MaraFolder = TEXT("/Game/ItTakesOne/Mara");

	// Mara is the web game's toy hero, 1.3 m tall; the capsule fits her rather than the template's
	// 1.8 m mannequin.
	constexpr float CapsuleRadius = 30.f;
	constexpr float CapsuleHalfHeight = 66.f;
	// Her mesh faces +Y after the glTF import, like the mannequin: turned -90 to face +X.
	constexpr float MeshYaw = -90.f;

	// The cycles' natural ground speeds at her size (cm/s), from the web game (PlayerAvatar.ts).
	constexpr float WalkSpeed = 150.f;
	constexpr float JogSpeed = 390.f;
	constexpr float SprintSpeed = 600.f;

	float Damp(float From, float To, float Rate, float Dt)
	{
		return FMath::Lerp(To, From, FMath::Exp(-Rate * Dt));
	}
}

/** Samples the layers the game thread chose and blends them; no graph. */
struct FMaraAnimProxy : public FAnimInstanceProxy
{
	explicit FMaraAnimProxy(UAnimInstance* In) : FAnimInstanceProxy(In) {}

	TArray<UMaraAnimInstance::FLayer> Layers;
	UMaraAnimInstance::FLayer Overlay;
	bool bUpperOnly = true;

	virtual void PreUpdate(UAnimInstance* InAnimInstance, float DeltaSeconds) override
	{
		FAnimInstanceProxy::PreUpdate(InAnimInstance, DeltaSeconds);
		const UMaraAnimInstance* M = CastChecked<UMaraAnimInstance>(InAnimInstance);
		Layers = M->Layers;
		Overlay = M->Overlay;
		bUpperOnly = M->bOverlayUpperOnly;
	}

	static void Sample(const UMaraAnimInstance::FLayer& L, FPoseContext& Out)
	{
		FAnimationPoseData Data(Out);
		L.Seq->GetAnimationPose(Data, FAnimExtractContext(static_cast<double>(L.Time), false));
	}

	virtual bool Evaluate(FPoseContext& Output) override
	{
		// A weighted average, built up two poses at a time.
		float Total = 0.f;
		for (const UMaraAnimInstance::FLayer& L : Layers)
		{
			if (!L.Seq || L.Weight <= ZERO_ANIMWEIGHT_THRESH)
			{
				continue;
			}
			if (Total <= 0.f)
			{
				Sample(L, Output);
				Total = L.Weight;
				continue;
			}
			FPoseContext Next(Output);
			Sample(L, Next);
			FAnimationPoseData OutData(Output);
			const FAnimationPoseData NextData(Next);
			FAnimationRuntime::BlendTwoPosesTogetherInPlace(OutData, NextData, Total / (Total + L.Weight));
			Total += L.Weight;
		}
		if (Total <= 0.f)
		{
			Output.ResetToRefPose();
		}

		// The one-shot over the upper body: spine_01 a third, spine_02 two thirds, the rest of the
		// chest, arms and head fully; the hips and legs not at all.
		if (Overlay.Seq && Overlay.Weight > ZERO_ANIMWEIGHT_THRESH)
		{
			FPoseContext Top(Output);
			Sample(Overlay, Top);
			const FBoneContainer& Bones = Output.Pose.GetBoneContainer();
			const FReferenceSkeleton& Ref = Bones.GetReferenceSkeleton();
			TArray<float, TInlineAllocator<128>> Mask;
			Mask.SetNumZeroed(Output.Pose.GetNumBones());
			for (FCompactPoseBoneIndex I : Output.Pose.ForEachBoneIndex())
			{
				float W = 1.f;
				if (bUpperOnly)
				{
					const FName Name = Ref.GetBoneName(Bones.MakeMeshPoseIndex(I).GetInt());
					if (Name == TEXT("spine_01"))
					{
						W = 0.35f;
					}
					else if (Name == TEXT("spine_02"))
					{
						W = 0.7f;
					}
					else
					{
						const FCompactPoseBoneIndex Parent = Bones.GetParentBoneIndex(I);
						W = Parent.GetInt() >= 0 && Mask[Parent.GetInt()] > 0.f ? 1.f : 0.f;
					}
				}
				Mask[I.GetInt()] = W;
				if (W > 0.f)
				{
					Output.Pose[I].BlendWith(Top.Pose[I], W * Overlay.Weight);
				}
			}
		}
		return true;
	}
};

FAnimInstanceProxy* UMaraAnimInstance::CreateAnimInstanceProxy()
{
	return new FMaraAnimProxy(this);
}

void UMaraAnimInstance::DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy)
{
	delete static_cast<FMaraAnimProxy*>(InProxy);
}

bool UMaraAnimInstance::Dress(ACharacter* C)
{
	USkeletalMeshComponent* Body = C ? C->GetMesh() : nullptr;
	if (!Body)
	{
		return false;
	}
	TArray<FAssetData> Assets;
	IAssetRegistry& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();
	// At start-up the registry may still be scanning the project in the background: scan her folder now.
	Registry.ScanPathsSynchronous({FString(MaraFolder)}, false);
	Registry.GetAssetsByPath(FName(MaraFolder), Assets, true);
	TArray<USkeletalMesh*> Parts;
	TArray<UStaticMesh*> Rigid;
	TMap<FName, TObjectPtr<UAnimSequence>> Clips;
	for (const FAssetData& A : Assets)
	{
		UObject* O = A.GetAsset();
		if (USkeletalMesh* M = Cast<USkeletalMesh>(O))
		{
			Parts.Add(M);
		}
		else if (UStaticMesh* R = Cast<UStaticMesh>(O); R && R->GetName().StartsWith(TEXT("MaraPart_")))
		{
			Rigid.Add(R);
		}
		else if (UAnimSequence* S = Cast<UAnimSequence>(O))
		{
			// Imported as "Mara<clip>": "Marajog" -> "jog".
			FString Name = S->GetName();
			Name.RemoveFromStart(TEXT("Mara"));
			Clips.Add(FName(*Name), S);
		}
	}
	if (Parts.Num() == 0 || !Clips.Contains(TEXT("idle")))
	{
		UE_LOG(LogStormworks, Warning, TEXT("Mara: not found under %s (import Mara.glb first); keeping the template character."), MaraFolder);
		return false;
	}
	// The part with the whole skeleton leads; the others (outfit, hair, head...) follow its pose.
	Parts.Sort([](const USkeletalMesh& A, const USkeletalMesh& B) { return A.GetRefSkeleton().GetNum() > B.GetRefSkeleton().GetNum(); });

	C->GetCapsuleComponent()->SetCapsuleSize(CapsuleRadius, CapsuleHalfHeight);
	Body->SetSkeletalMeshAsset(Parts[0]);
	Body->EmptyOverrideMaterials();
	Body->SetRelativeLocation(FVector(0.f, 0.f, -CapsuleHalfHeight));
	Body->SetRelativeRotation(FRotator(0.f, MeshYaw, 0.f));
	Body->SetRelativeScale3D(FVector::OneVector);
	Body->SetAnimInstanceClass(UMaraAnimInstance::StaticClass());
	for (int32 i = 1; i < Parts.Num(); ++i)
	{
		USkeletalMeshComponent* P = NewObject<USkeletalMeshComponent>(C, *FString::Printf(TEXT("Mara_%s"), *Parts[i]->GetName()));
		P->SetupAttachment(Body);
		P->SetSkeletalMeshAsset(Parts[i]);
		P->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		P->RegisterComponent();
		P->SetLeaderPoseComponent(Body);
	}
	// Her rigid parts (eyes, brows, mouth, the scarf's knot, the kit on her back), each on its bone
	// (named MaraPart_<bone>_<node> by tools/unreal/prepare_mara.py). Their geometry is in her bind
	// pose, so relative to the bone they sit at the inverse of the bone's reference pose.
	const FReferenceSkeleton& Ref = Parts[0]->GetRefSkeleton();
	int32 Attached = 0;
	TArray<UStaticMeshComponent*> RigidComponents;
	for (UStaticMesh* R : Rigid)
	{
		FString Bone = R->GetName();
		Bone.RemoveFromStart(TEXT("MaraPart_"));
		Bone = Bone.Left(Bone.Find(TEXT("_"), ESearchCase::CaseSensitive, ESearchDir::FromEnd));
		const int32 BoneIndex = Ref.FindBoneIndex(FName(*Bone));
		if (BoneIndex == INDEX_NONE)
		{
			continue;
		}
		UStaticMeshComponent* P = NewObject<UStaticMeshComponent>(C, *FString::Printf(TEXT("Mara_%s"), *R->GetName()));
		P->SetStaticMesh(R);
		P->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		P->SetupAttachment(Body, FName(*Bone));
		P->SetRelativeTransform(FAnimationRuntime::GetComponentSpaceTransformRefPose(Ref, BoneIndex).Inverse());
		// Small parts inside her silhouette: no shadows (as in the web game), and 22 fewer shadow
		// draws for every shadow-casting light.
		P->SetCastShadow(false);
		P->RegisterComponent();
		RigidComponents.Add(P);
		++Attached;
	}
	if (UMaraAnimInstance* Anim = Cast<UMaraAnimInstance>(Body->GetAnimInstance()))
	{
		Anim->Clips = MoveTemp(Clips);
	}
	UE_LOG(LogStormworks, Log, TEXT("Mara: %d rigid parts on their bones"), Attached);
	// Her living face and her scarf's tails.
	UMaraFace* Face = NewObject<UMaraFace>(C, TEXT("MaraFace"));
	Face->RegisterComponent();
	Face->Setup(Body, RigidComponents);
	UE_LOG(LogStormworks, Log, TEXT("Mara: %d mesh parts (leader %s, %d bones), %d clips"), Parts.Num(), *Parts[0]->GetName(), Parts[0]->GetRefSkeleton().GetNum(), Cast<UMaraAnimInstance>(Body->GetAnimInstance()) ? Cast<UMaraAnimInstance>(Body->GetAnimInstance())->Clips.Num() : 0);
	return true;
}

const UAnimSequence* UMaraAnimInstance::Clip(FName Name) const
{
	const TObjectPtr<UAnimSequence>* S = Clips.Find(Name);
	return S ? S->Get() : nullptr;
}

float UMaraAnimInstance::Length(FName Name) const
{
	const UAnimSequence* S = Clip(Name);
	return S ? FMath::Max(S->GetPlayLength(), 0.01f) : 1.f;
}

void UMaraAnimInstance::PlayAction(FName InClip, float Rate, float Start, float InLength, bool bUpperBodyOnly)
{
	if (!Clip(InClip))
	{
		return;
	}
	Action = InClip;
	ActionName = InClip;
	ActionT = 0.f;
	ActionRate = FMath::Max(Rate, 0.05f);
	ActionStart = FMath::Clamp(Start, 0.f, Length(InClip));
	ActionLength = InLength > 0.f ? InLength : Length(InClip) - ActionStart;
	bActionUpper = bUpperBodyOnly;
}

void UMaraAnimInstance::NativeInitializeAnimation()
{
	Owner = Cast<ACharacter>(TryGetPawnOwner());
}

void UMaraAnimInstance::NativeUpdateAnimation(float Dt)
{
	Layers.Reset();
	Overlay = FLayer();
	ACharacter* C = Owner.Get();
	if (!C)
	{
		C = Cast<ACharacter>(TryGetPawnOwner());
		Owner = C;
	}
	if (!C || !Clip(TEXT("idle")))
	{
		return;
	}
	if (!Tether.IsValid())
	{
		Tether = C->FindComponentByClass<UTetherComponent>();
	}
	const UTetherComponent* T = Tether.Get();
	const UCharacterMovementComponent* MC = C->GetCharacterMovement();
	const FVector V = MC->Velocity;
	const bool bCarried = T && T->GetState() == ETetherState::Reeling;
	const bool bFalling = MC->IsFalling() && !bCarried;

	// --- events: take-off, landing, the tether's throw, the pickup
	if (bFalling && !bWasFalling && V.Z > 150.f)
	{
		JumpStartT = 0.f;
	}
	if (bFalling)
	{
		LastFallSpeed = FMath::Max(0.f, -V.Z);
	}
	if (!MC->IsFalling() && bWasFalling)
	{
		if (LastFallSpeed > 250.f)
		{
			LandT = 0.f;
			LandWeight = FMath::Clamp((LastFallSpeed - 250.f) / 900.f, 0.3f, 1.f);
		}
		OnLanded.Broadcast(LastFallSpeed);
		LastFallSpeed = 0.f;
	}
	bWasFalling = MC->IsFalling();
	if (T && T->Fires != LastTetherFires)
	{
		LastTetherFires = T->Fires;
		// The reach-and-throw of the interact clip, quick.
		PlayAction(TEXT("interact"), 1.5f, 0.3f, 0.6f, true);
	}

	// --- one-shot weight: in fast, out when it has played
	if (Action != NAME_None)
	{
		ActionT += Dt;
		const bool bDone = ActionT * ActionRate >= ActionLength;
		ActionWeight = Damp(ActionWeight, bDone ? 0.f : 1.f, bDone ? 9.f : 20.f, Dt);
		if (bDone && ActionWeight < 0.02f)
		{
			Action = NAME_None;
			ActionWeight = 0.f;
		}
	}
	const float FullAction = Action != NAME_None && !bActionUpper ? ActionWeight : 0.f;

	// --- air and carry
	AirTime = bFalling ? AirTime + Dt : 0.f;
	const bool bAirborne = bFalling && (AirTime > 0.1f || V.Z > 100.f);
	AirBlend = Damp(AirBlend, bAirborne ? 1.f : 0.f, bAirborne ? 12.f : 18.f, Dt);
	CarryBlend = Damp(CarryBlend, bCarried ? 1.f : 0.f, 14.f, Dt);
	float JumpStartW = 0.f;
	if (JumpStartT >= 0.f)
	{
		JumpStartT += Dt;
		const bool bEnd = !bFalling || (JumpStartT > 0.12f && V.Z < 0.f);
		JumpStartW = bEnd ? 0.f : 1.f;
		if (bEnd)
		{
			JumpStartT = -1.f;
		}
	}

	// --- landing
	float Land = 0.f;
	if (LandT >= 0.f)
	{
		LandT += Dt;
		Land = LandWeight * FMath::Max(0.f, 1.f - LandT / 0.35f);
		if (LandT > 0.35f)
		{
			LandT = -1.f;
		}
	}

	// --- locomotion: idle, walk, jog and sprint by ground speed, on one shared phase
	const float Speed = !MC->IsFalling() ? V.Size2D() : 0.f;
	GroundSpeed = Speed;
	float WIdle = 0.f, WWalk = 0.f, WJog = 0.f, WSprint = 0.f;
	if (Speed < 15.f)
	{
		WIdle = 1.f;
	}
	else if (Speed < WalkSpeed)
	{
		const float A = (Speed - 15.f) / (WalkSpeed - 15.f);
		WIdle = 1.f - A;
		WWalk = A;
	}
	else if (Speed < JogSpeed)
	{
		const float A = (Speed - WalkSpeed) / (JogSpeed - WalkSpeed);
		WWalk = 1.f - A;
		WJog = A;
	}
	else
	{
		const float A = FMath::Clamp((Speed - JogSpeed) / (SprintSpeed - JogSpeed), 0.f, 1.f);
		WJog = 1.f - A;
		WSprint = A;
	}
	const float Moving = WWalk + WJog + WSprint;
	float Rate = 0.f;
	Rate += WWalk * FMath::Clamp(Speed / WalkSpeed, 0.6f, 1.4f) / Length(TEXT("walk"));
	Rate += WJog * FMath::Clamp(Speed / JogSpeed, 0.6f, 1.4f) / Length(TEXT("jog"));
	Rate += WSprint * FMath::Clamp(Speed / SprintSpeed, 0.6f, 1.4f) / Length(TEXT("sprint"));
	if (Moving > 0.f)
	{
		Rate /= Moving;
	}
	const float Before = Phase;
	Phase = FMath::Fmod(Phase + Dt * Rate, 1.f);
	if (!MC->IsFalling() && Speed > 100.f && FMath::FloorToInt(Before * 2.f) != FMath::FloorToInt(Phase * 2.f))
	{
		++FootDowns;
		OnFootDown.Broadcast(FMath::FloorToInt(Phase * 2.f) == 0, Speed);
	}
	IdleTime = Speed < 15.f && !MC->IsFalling() ? IdleTime + Dt : 0.f;

	// --- the layers
	const float Air = FMath::Max(AirBlend, CarryBlend);
	const float Ground = (1.f - Air) * (1.f - Land) * (1.f - FullAction);
	Clock += Dt;
	auto Add = [this](FName Name, float Time, float Weight)
	{
		if (Weight > ZERO_ANIMWEIGHT_THRESH)
		{
			if (const UAnimSequence* S = Clip(Name))
			{
				Layers.Add({S, Time, Weight});
			}
		}
	};
	Add(TEXT("idle"), FMath::Fmod(Clock, Length(TEXT("idle"))), WIdle * Ground);
	Add(TEXT("walk"), Phase * Length(TEXT("walk")), WWalk * Ground);
	Add(TEXT("jog"), Phase * Length(TEXT("jog")), WJog * Ground);
	Add(TEXT("sprint"), Phase * Length(TEXT("sprint")), WSprint * Ground);
	Add(TEXT("jumpStart"), FMath::Min(JumpStartT, Length(TEXT("jumpStart"))), Air * JumpStartW * (1.f - FullAction));
	Add(TEXT("jumpLoop"), FMath::Fmod(AirTime + Clock * (bCarried ? 1.f : 0.f), Length(TEXT("jumpLoop"))), Air * (1.f - JumpStartW) * (1.f - FullAction));
	Add(TEXT("land"), FMath::Max(LandT, 0.f), Land * (1.f - FullAction));
	if (FullAction > 0.f)
	{
		Add(Action, ActionStart + ActionT * ActionRate, FullAction);
	}

	// --- the upper body: a one-shot, or the taut cable's pose while she hauls a machine
	const bool bPulling = T && T->GetState() == ETetherState::Pulling;
	PullBlend = Damp(PullBlend, bPulling ? 1.f : 0.f, bPulling ? 10.f : 6.f, Dt);
	bOverlayUpperOnly = true;
	if (Action != NAME_None && bActionUpper)
	{
		Overlay = {Clip(Action), FMath::Min(ActionStart + ActionT * ActionRate, Length(Action)), ActionWeight};
	}
	else if (PullBlend > 0.01f && Clip(TEXT("push")))
	{
		// Arms out along the taut cable: the middle of the push clip, held.
		Overlay = {Clip(TEXT("push")), Length(TEXT("push")) * 0.45f, 0.85f * PullBlend};
	}
}
