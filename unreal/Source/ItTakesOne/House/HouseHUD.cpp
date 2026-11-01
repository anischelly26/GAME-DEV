#include "House/HouseHUD.h"

#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "House/HouseGameMode.h"
#include "Misc/ScopeExit.h"
#include "Stormworks/ReadyGate.h"
#include "Stormworks/StormCinema.h"

void AHouseHUD::Label(const FString& Text, float X, float Y, const FLinearColor& Color, float Scale, bool bCentred, bool bBackdrop)
{
	UFont* Font = GEngine->GetMediumFont();
	float W = 0.f, H = 0.f;
	GetTextSize(Text, W, H, Font, Scale);
	const float Left = bCentred ? X - W * 0.5f : X;
	if (bBackdrop)
	{
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.45f), Left - 10.f * Scale, Y - 5.f * Scale, W + 20.f * Scale, H + 10.f * Scale);
	}
	DrawText(Text, Color, Left, Y, Font, Scale);
}

void AHouseHUD::DrawHUD()
{
	Super::DrawHUD();
	const AHouseGameMode* GM = GetWorld()->GetAuthGameMode<AHouseGameMode>();
	if (!Canvas || !GM)
	{
		return;
	}
	const float SX = Canvas->ClipX;
	const float SY = Canvas->ClipY;
	// Readable at 720p as well as 1080p.
	const float UI = FMath::Clamp(SY / 1080.f, 0.8f, 2.f) * 1.3f;
	ON_SCOPE_EXIT
	{
		if (GM->Gate)
		{
			GM->Gate->DrawOn(const_cast<AHouseHUD*>(this), SX, SY);
		}
	};
	const FLinearColor Ink(0.95f, 0.93f, 0.88f, 1.f);

	if (GM->Cinema && GM->Cinema->IsPlaying())
	{
		const float Bar = SY * 0.09f;
		DrawRect(FLinearColor::Black, 0.f, 0.f, SX, Bar);
		DrawRect(FLinearColor::Black, 0.f, SY - Bar, SX, Bar);
		Label(TEXT("[Space]  Skip"), SX - 150.f * UI, SY - Bar * 0.5f - 12.f * UI, FLinearColor(0.8f, 0.82f, 0.85f, 0.7f), 0.8f * UI, false, false);
		return;
	}
	if (GM->bComplete)
	{
		DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.55f), 0.f, SY * 0.36f, SX, SY * 0.28f);
		Label(TEXT("The house under Knoll Rock"), SX * 0.5f, SY * 0.41f, Ink, 1.6f * UI, true, false);
		Label(TEXT("To be continued: the Sunken Conservatory"), SX * 0.5f, SY * 0.52f, FLinearColor(0.6f, 0.85f, 0.95f, 1.f), 1.0f * UI, true, false);
		return;
	}
	if (!GM->Objective.IsEmpty())
	{
		Label(TEXT("OBJECTIVE"), 40.f * UI, 34.f * UI, FLinearColor(0.45f, 0.85f, 0.78f, 0.9f), 0.85f * UI, false, false);
		Label(GM->Objective, 40.f * UI, 58.f * UI, Ink, 1.15f * UI, false, true);
	}
	if (!GM->Prompt.IsEmpty())
	{
		Label(GM->Prompt, SX * 0.5f, SY * 0.66f, Ink, 0.95f * UI, true, true);
	}
	if (GM->MessageLeft > 0.f && !GM->Message.IsEmpty())
	{
		const float A = FMath::Clamp(GM->MessageLeft / 0.4f, 0.f, 1.f);
		Label(GM->Message, SX * 0.5f, SY * 0.8f, Ink * FLinearColor(1.f, 1.f, 1.f, A), 1.05f * UI, true, true);
	}
	if (GM->Fade > 0.01f)
	{
		DrawRect(FLinearColor(0.f, 0.f, 0.f, GM->Fade), 0.f, 0.f, SX, SY);
	}
}
