#include "Stormworks/StormworksHUD.h"

#include "Misc/ScopeExit.h"
#include "Stormworks/ReadyGate.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "GameFramework/Character.h"
#include "Stormworks/StormCinema.h"
#include "Stormworks/StormworksAssets.h"
#include "Stormworks/StormworksGameMode.h"
#include "Stormworks/StoryNote.h"
#include "Stormworks/TetherComponent.h"
#include "Stormworks/TetherPoint.h"
#include "Stormworks/WorkshopToy.h"

namespace
{
	const FLinearColor Ink(0.93f, 0.91f, 0.86f, 1.f);
	const FLinearColor Dim(0.6f, 0.62f, 0.64f, 0.9f);
	const FLinearColor Backdrop(0.02f, 0.03f, 0.04f, 0.55f);
}

void AStormworksHUD::DrawLabel(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentered, bool bBackdrop)
{
	UFont* Font = GEngine->GetMediumFont();
	float W = 0.f, H = 0.f;
	GetTextSize(Text, W, H, Font, Scale);
	const float Left = bCentered ? X - W * 0.5f : X;
	if (bBackdrop)
	{
		DrawRect(Backdrop, Left - 10.f, Y - 5.f, W + 20.f, H + 10.f);
	}
	DrawText(Text, Color, Left, Y, Font, Scale);
}

void AStormworksHUD::DrawWrapped(const FString& Text, float X, float Y, float Width, const FLinearColor& Color, float Scale)
{
	UFont* Font = GEngine->GetMediumFont();
	TArray<FString> Paragraphs;
	Text.ParseIntoArray(Paragraphs, TEXT("\n"), false);
	float LineY = Y;
	for (const FString& Para : Paragraphs)
	{
		TArray<FString> Words;
		Para.ParseIntoArrayWS(Words);
		FString Line;
		for (const FString& Word : Words)
		{
			const FString Try = Line.IsEmpty() ? Word : Line + TEXT(" ") + Word;
			float W = 0.f, H = 0.f;
			GetTextSize(Try, W, H, Font, Scale);
			if (W > Width && !Line.IsEmpty())
			{
				DrawText(Line, Color, X, LineY, Font, Scale);
				LineY += H * 1.15f;
				Line = Word;
			}
			else
			{
				Line = Try;
			}
		}
		float W = 0.f, H = 0.f;
		GetTextSize(TEXT("Ag"), W, H, Font, Scale);
		if (!Line.IsEmpty())
		{
			DrawText(Line, Color, X, LineY, Font, Scale);
		}
		LineY += H * 1.15f * (Line.IsEmpty() ? 0.6f : 1.f);
	}
}

void AStormworksHUD::DrawRing(const FVector2D& Center, float Radius, const FLinearColor& Color, float Thickness)
{
	const int32 N = 32;
	for (int32 i = 0; i < N; ++i)
	{
		const float A0 = 2.f * PI * i / N;
		const float A1 = 2.f * PI * (i + 1) / N;
		DrawLine(Center.X + Radius * FMath::Cos(A0), Center.Y + Radius * FMath::Sin(A0), Center.X + Radius * FMath::Cos(A1), Center.Y + Radius * FMath::Sin(A1), Color, Thickness);
	}
}

void AStormworksHUD::DrawHUD()
{
	Super::DrawHUD();
	if (!Canvas)
	{
		return;
	}
	AStormworksGameMode* GM = GetWorld()->GetAuthGameMode<AStormworksGameMode>();
	if (!GM)
	{
		return;
	}
	const float SX = Canvas->ClipX;
	const float SY = Canvas->ClipY;
	// Readable at 720p as well as 1080p.
	const float UI = FMath::Clamp(SY / 1080.f, 0.8f, 2.f) * 1.3f;
	const double Now = GetWorld()->GetTimeSeconds();
	ON_SCOPE_EXIT
	{
		if (GM->Gate)
		{
			GM->Gate->DrawOn(this, SX, SY);
		}
	};

	// A cinematic: letterbox bars and the way out of it, nothing else.
	if (GM->Cinema && GM->Cinema->IsPlaying())
	{
		const float Bar = SY * 0.09f;
		DrawRect(FLinearColor::Black, 0.f, 0.f, SX, Bar);
		DrawRect(FLinearColor::Black, 0.f, SY - Bar, SX, Bar);
		DrawLabel(TEXT("[Space]  Skip"), SX - 150.f * UI, SY - Bar * 0.5f - 12.f * UI, FLinearColor(0.8f, 0.82f, 0.85f, 0.7f), 0.8f * UI, false, false);
		return;
	}

	// Objective.
	if (!GM->Objective.IsEmpty())
	{
		DrawLabel(TEXT("OBJECTIVE"), 40.f * UI, 34.f * UI, FLinearColor(0.45f, 0.85f, 0.78f, 0.9f), 0.85f * UI, false, false);
		DrawLabel(GM->Objective, 40.f * UI, 58.f * UI, Ink, 1.15f * UI, false, true);
	}

	UTetherComponent* T = GM->GetTether();
	ACharacter* C = GM->GetPlayerCharacter();
	const FVector2D Mid(SX * 0.5f, SY * 0.5f);

	// The way out of a bad spot, kept quiet in the corner.
	if (T && T->bHasTether && !GM->OpenNote)
	{
		DrawLabel(TEXT("[R]  Back to checkpoint"), 40.f * UI, SY - 56.f * UI, FLinearColor(0.75f, 0.78f, 0.82f, 0.55f), 0.75f * UI, false, false);
	}

	if (!GM->OpenNote)
	{
		// Reticle.
		DrawRect(FLinearColor(1.f, 1.f, 1.f, 0.55f), Mid.X - 2.f, Mid.Y - 2.f, 4.f, 4.f);

		// The tether's target, or a ring that is out of reach.
		if (T && T->bHasTether)
		{
			ATetherPoint* Target = T->GetTarget();
			ATetherPoint* Far = T->GetOutOfReach();
			if (ATetherPoint* P = Target ? Target : Far)
			{
				const FVector S = Project(P->GetAttachLocation());
				if (S.Z > 0.f)
				{
					const FVector2D At(S.X, S.Y);
					if (Target)
					{
						const float Pulse = 1.f + 0.08f * FMath::Sin(Now * 7.0);
						DrawRing(At, 26.f * UI * Pulse, Stormworks::Accent(), 2.5f);
						DrawRing(At, 31.f * UI * Pulse, Stormworks::Accent() * FLinearColor(1.f, 1.f, 1.f, 0.4f), 1.f);
						const FString Verb = P->Kind == ETetherPointKind::Pull ? TEXT("Pull") : TEXT("Tether");
						DrawLabel(FString::Printf(TEXT("[E]  %s"), *Verb), At.X, At.Y + 40.f * UI, Ink, 0.95f * UI, true, true);
					}
					else
					{
						DrawRing(At, 22.f * UI, Dim * FLinearColor(1.f, 1.f, 1.f, 0.7f), 1.5f);
						DrawLabel(TEXT("Too far"), At.X, At.Y + 34.f * UI, Dim, 0.85f * UI, true, true);
					}
				}
			}
			if (T->GetState() == ETetherState::Reeling)
			{
				DrawLabel(TEXT("[Space]  Let go"), Mid.X, SY * 0.78f, Dim, 0.85f * UI, true, true);
			}
		}

		// A note in front of her.
		if (AStoryNote* Note = GM->NoteInReach(C))
		{
			DrawLabel(TEXT("[E]  Read"), Mid.X, SY * 0.62f, Ink, 0.95f * UI, true, true);
		}
		else if (AWorkshopToy* Toy = GM->ToyInReach(C); Toy && !Toy->IsPlaying())
		{
			DrawLabel(FString::Printf(TEXT("[E]  %s"), *Toy->Prompt), Mid.X, SY * 0.62f, Ink, 0.95f * UI, true, true);
		}
	}

	// Messages.
	if (GM->MessageLeft > 0.f && !GM->Message.IsEmpty())
	{
		const float A = FMath::Clamp(GM->MessageLeft / 0.4f, 0.f, 1.f) * FMath::Clamp((GM->MessageDuration - GM->MessageLeft) / 0.15f, 0.f, 1.f);
		DrawLabel(GM->Message, Mid.X, SY * 0.16f, FLinearColor(1.f, 0.93f, 0.8f, A), 1.2f * UI, true, A > 0.3f);
	}

	// The open note.
	if (AStoryNote* Note = GM->OpenNote)
	{
		const float W = FMath::Min(760.f * UI, SX * 0.8f);
		const float H = 420.f * UI;
		const float X = Mid.X - W * 0.5f;
		const float Y = Mid.Y - H * 0.5f;
		DrawRect(FLinearColor(0.05f, 0.045f, 0.04f, 0.86f), X, Y, W, H);
		DrawRect(FLinearColor(0.92f, 0.86f, 0.72f, 0.95f), X + 6.f, Y + 6.f, W - 12.f, H - 12.f);
		const FLinearColor InkDark(0.12f, 0.1f, 0.08f, 1.f);
		DrawLabel(Note->Title, X + 34.f * UI, Y + 28.f * UI, InkDark, 1.25f * UI, false, false);
		DrawWrapped(Note->Body, X + 34.f * UI, Y + 78.f * UI, W - 68.f * UI, InkDark, 1.f * UI);
		DrawLabel(TEXT("[E]  Close"), X + W - 120.f * UI, Y + H - 44.f * UI, FLinearColor(0.3f, 0.26f, 0.2f, 1.f), 0.85f * UI, false, false);
	}

	// End card.
	if (GM->bComplete && !GM->OpenNote)
	{
		DrawLabel(TEXT("THE STORMWORKS ESCAPE"), Mid.X, SY * 0.28f, FLinearColor(1.f, 0.9f, 0.7f, 1.f), 1.6f * UI, true, true);
		DrawLabel(FString::Printf(TEXT("%d:%02d     falls: %d"), int32(GM->CompleteTime) / 60, int32(GM->CompleteTime) % 60, GM->Falls), Mid.X, SY * 0.34f, Ink, 1.f * UI, true, false);
		if (GM->ContinueIn > 0.f)
		{
			DrawLabel(TEXT("[E]  Continue: the house under Knoll Rock"), Mid.X, SY * 0.42f, Ink, 0.95f * UI, true, false);
		}
	}

	// Fade after a respawn.
	if (GM->Fade > 0.f)
	{
		DrawRect(FLinearColor(0.f, 0.f, 0.f, FMath::Clamp(GM->Fade, 0.f, 1.f)), 0.f, 0.f, SX, SY);
	}
}
