#include "PhillyMechanicsProbe.h"
#include "PhillyGameplay.h"
#include "PhillyDistrict.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerInput.h"
#include "InputKeyEventArgs.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Kismet/GameplayStatics.h"
#include "EngineUtils.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "UnrealClient.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Components/CapsuleComponent.h"
#include "RHIStats.h"
#include "DynamicRHI.h"
#include "HAL/PlatformMemory.h"

APhillyMechanicsProbe::APhillyMechanicsProbe()
{
    PrimaryActorTick.bCanEverTick=true;
    PrimaryActorTick.TickGroup=TG_PostUpdateWork;
    double Requested=20;
    if(FParse::Value(FCommandLine::Get(),TEXT("PhillyWalkMeters="),Requested) && FMath::IsFinite(Requested))
        WalkDistanceMeters=FMath::Clamp(Requested,20.0,150.0);
    double Turn=0,Yaw=0;
    if(FParse::Value(FCommandLine::Get(),TEXT("PhillyWalkTurnMeters="),Turn)
        && FParse::Value(FCommandLine::Get(),TEXT("PhillyWalkTurnYaw="),Yaw)
        && FMath::IsFinite(Turn) && FMath::IsFinite(Yaw) && Turn>0 && Turn<WalkDistanceMeters)
    {WalkTurnMeters=Turn;WalkTurnYaw=Yaw;}
}
void APhillyMechanicsProbe::Key(const FKey& K,bool Pressed)
{
    if(auto* PC=UGameplayStatics::GetPlayerController(this,0))
        PC->InputKey(FInputKeyEventArgs(GEngine->GameViewport->Viewport,INPUTDEVICEID_NONE,K,Pressed?IE_Pressed:IE_Released,Pressed?1.f:0.f,false,FPlatformTime::Cycles64()));
}
void APhillyMechanicsProbe::Pulse(const FKey& K) {Key(K,true);PulseKey=K;}
void APhillyMechanicsProbe::Next(int32 NewStage,const FString& Note)
{
    Stage=NewStage;StageAt=FPlatformTime::Seconds();
    Evidence+=FString::Printf(TEXT("stage %d: %s\n"),Stage,*Note);
    UE_LOG(LogTemp,Display,TEXT("PHILLY_PROBE %d %s"),Stage,*Note);
}
void APhillyMechanicsProbe::Finish(bool Passed,const FString& Reason)
{
    const bool WalkOnly=FParse::Param(FCommandLine::Get(),TEXT("PhillyWalkProbe"));
    if(!Passed && WalkOnly)
    {
        if(auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode());G && G->Walker)
        {
            auto* W=G->Walker.Get();
            Evidence+=FString::Printf(TEXT("failure_position_cm=%s velocity=%s floor=%s\n"),*W->GetActorLocation().ToString(),*W->GetVelocity().ToString(),*GetNameSafe(W->GetCharacterMovement()->CurrentFloor.HitResult.GetActor()));
            auto* PC=UGameplayStatics::GetPlayerController(this,0);
            Evidence+=FString::Printf(TEXT("input_w_down=%d ignore_move=%d movement_mode=%d\n"),PC->IsInputKeyDown(EKeys::W),PC->IsMoveInputIgnored(),int32(W->GetCharacterMovement()->MovementMode));
            const FVector Ahead=FRotationMatrix(FRotator(0,PC->GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::X);
            FCollisionQueryParams Query(SCENE_QUERY_STAT(PhillyWalkObstacle),true,W);
            for(double Height:{5.,20.,40.,90.})
            {
                const FVector Start=W->GetActorLocation()+FVector(0,0,Height-W->GetCapsuleComponent()->GetScaledCapsuleHalfHeight());
                FHitResult Hit;
                if(GetWorld()->LineTraceSingleByChannel(Hit,Start,Start+Ahead*100,ECC_Visibility,Query))
                    Evidence+=FString::Printf(TEXT("forward_hit height=%.0f actor=%s component=%s point=%s normal=%s\n"),Height,*GetNameSafe(Hit.GetActor()),*GetNameSafe(Hit.GetComponent()),*Hit.ImpactPoint.ToString(),*Hit.ImpactNormal.ToString());
            }
        }
        FScreenshotRequest::RequestScreenshot(FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir()/TEXT("Screenshots/NativeWalkProbe.png")),true,false);
    }
    for(const FKey& K:{EKeys::W,EKeys::A,EKeys::D,EKeys::SpaceBar,EKeys::F,EKeys::F5,EKeys::F9})Key(K,false);
    const FString Result=FString::Printf(TEXT("status=%s\nreason=%s\n"),Passed?TEXT("passed bounded probe only"):TEXT("failed"),*Reason)+Evidence;
    FFileHelper::SaveStringToFile(Result,*(FPaths::ProjectSavedDir()/(WalkOnly?TEXT("walk-probe.txt"):TEXT("mechanics-probe.txt"))));
    if(FrameTimes.Num())
    {
        FrameTimes.Sort();double Sum=0;for(double V:FrameTimes)Sum+=V;
        const FIntPoint Size=GEngine->GameViewport->Viewport->GetSizeXY();
        const FString Scope=WalkOnly?FString::Printf(TEXT("bounded_%.0fm_walk"),WalkDistanceMeters):TEXT("short_gameplay_probe");
        const FString Csv=FString::Printf(TEXT("scope,frames,mean_ms,p95_ms,p99_ms,width,height\n%s,%d,%.3f,%.3f,%.3f,%d,%d\n"),*Scope,FrameTimes.Num(),Sum/FrameTimes.Num(),FrameTimes[FMath::Min(FrameTimes.Num()-1,int32(FrameTimes.Num()*.95))],FrameTimes[FMath::Min(FrameTimes.Num()-1,int32(FrameTimes.Num()*.99))],Size.X,Size.Y);
        FFileHelper::SaveStringToFile(Csv,*(FPaths::ProjectSavedDir()/(WalkOnly?TEXT("walk-frame-sample.csv"):TEXT("mechanics-frame-sample.csv"))));
        FTextureMemoryStats TextureMemory;RHIGetTextureMemoryStats(TextureMemory);
        const auto Memory=FPlatformMemory::GetStats();
        const FString RenderCsv=FString::Printf(TEXT("scope,samples,mean_rhi_draw_calls,mean_rhi_primitives,process_ram_bytes,texture_allocated_bytes,texture_pool_bytes\n%s,%d,%.1f,%.1f,%llu,%llu,%lld\n"),*Scope,RenderSamples,RenderSamples?DrawCallSum/RenderSamples:0,RenderSamples?PrimitiveSum/RenderSamples:0,static_cast<unsigned long long>(Memory.UsedPhysical),static_cast<unsigned long long>(TextureMemory.StreamingMemorySize+TextureMemory.NonStreamingMemorySize),static_cast<long long>(TextureMemory.TexturePoolSize));
        FFileHelper::SaveStringToFile(RenderCsv,*(FPaths::ProjectSavedDir()/TEXT("walk-render-sample.csv")));
    }
    UE_LOG(LogTemp,Display,TEXT("PHILLY_PROBE_RESULT %s"),*Result);
    bDone=true;
}
void APhillyMechanicsProbe::Tick(float Dt)
{
    Super::Tick(Dt);
    if(bDone)return;
    const double Now=FPlatformTime::Seconds();
    if(LaunchAt==0)LaunchAt=StageAt=LastAt=Now;
    if(PulseKey.IsValid()){Key(PulseKey,false);PulseKey=FKey();}
    if(Stage>0){FrameTimes.Add((Now-LastAt)*1000);DrawCallSum+=GNumDrawCallsRHI[0];PrimitiveSum+=GNumPrimitivesDrawnRHI[0];RenderSamples++;}
    LastAt=Now;
    auto* G=Cast<APhillyGameMode>(GetWorld()->GetAuthGameMode());
    auto* PC=UGameplayStatics::GetPlayerController(this,0);
    // Keep readiness and traversal budgets separate. A 130 m route already has
    // a 104 s movement deadline below; startup must not consume that allowance.
    if((Stage==0 && Now-LaunchAt>60) || Now-LaunchAt>180){Finish(false,TEXT("Timed out waiting for ready world or mechanics"));return;}
    if(!G || !PC || !IsValid(G->Walker))return;
    auto* Walker=G->Walker.Get();auto* Vehicle=G->Vehicle.Get();
    const double Age=Now-StageAt;
    if(FParse::Param(FCommandLine::Get(),TEXT("PhillyWalkProbe")))
    {
        if(Stage==0)
        {
            int32 Cells=0;for(TActorIterator<APhillyDistrict> It(GetWorld());It;++It)Cells=It->ReadyCells;
            if(Cells<20 || !Walker->GetCharacterMovement()->IsMovingOnGround())return;
            if(++WarmFrames<240 || Age<15)return;
            WalkStart=WalkLegStart=Walker->GetActorLocation();
            LastWalkProgressAt=Now;
            Evidence+=FString::Printf(TEXT("start_cm=%s ready_cells=%d\n"),*WalkStart.ToString(),Cells);
            Key(EKeys::W,true);Next(20,FString::Printf(TEXT("Walking %.0f metres through W input; no vehicle or save actions"),WalkDistanceMeters));
        }
        else if(Stage==20)
        {
            // This opt-in automation owns a held W input for the route. Desktop
            // focus changes can flush the synthetic key even with focus flushing
            // disabled. Restore only the key, never position, movement mode or
            // collision, and retain every restoration in the test evidence.
            if(!PC->IsInputKeyDown(EKeys::W))
            {
                Evidence+=FString::Printf(TEXT("held_input_restored elapsed_s=%.3f position=%s\n"),Age,*Walker->GetActorLocation().ToString());
                Key(EKeys::W,true);
            }
            const double Travel=CompletedWalkLeg+FVector::DistXY(WalkLegStart,Walker->GetActorLocation());
            if(WalkTurnMeters>0 && !bWalkTurned && Travel>=WalkTurnMeters*100)
            {
                CompletedWalkLeg=Travel;WalkLegStart=Walker->GetActorLocation();bWalkTurned=true;
                FRotator Look=PC->GetControlRotation();Look.Yaw=WalkTurnYaw;PC->SetControlRotation(Look);
                Evidence+=FString::Printf(TEXT("source_route_turn_cm=%s yaw=%.2f cumulative_cm=%.2f\n"),*WalkLegStart.ToString(),WalkTurnYaw,Travel);
            }
            if(Travel>BestWalkTravel+10){BestWalkTravel=Travel;LastWalkProgressAt=Now;}
            else if(Now-LastWalkProgressAt>5){Finish(false,FString::Printf(TEXT("Walk stalled at %.1f cm for five seconds"),Travel));return;}
            if(FMath::Abs(Walker->GetVelocity().Z)>250 || Walker->GetActorLocation().Z<WalkStart.Z-300)
            {Finish(false,TEXT("Unexpected vertical motion during street walk"));return;}
            if(Travel>=WalkDistanceMeters*100)
            {
                Key(EKeys::W,false);
                Evidence+=FString::Printf(TEXT("travel_cm=%.2f end_cm=%s grounded=%d\n"),Travel,*Walker->GetActorLocation().ToString(),Walker->GetCharacterMovement()->IsMovingOnGround());
                FString Neighborhood;
                if(FParse::Value(FCommandLine::Get(),TEXT("PhillyNeighborhood="),Neighborhood) && Neighborhood==TEXT("museum"))
                {
                    const FVector RouteDirection(-.766044443,-.642787610,0);
                    const FVector Expected=WalkStart+RouteDirection*(WalkDistanceMeters*100);
                    const double Error=FVector::DistXY(Expected,Walker->GetActorLocation());
                    Evidence+=FString::Printf(TEXT("museum_route_endpoint_error_cm=%.2f\n"),Error);
                    if(Error>100){Finish(false,TEXT("Walk did not follow the museum approach route"));return;}
                }
                Next(21,FString::Printf(TEXT("Reached %.0f metres; checking grounded stop"),WalkDistanceMeters));
            }
            else if(Age>FMath::Max(20.0,WalkDistanceMeters*.8)){Finish(false,FString::Printf(TEXT("Walk obstructed or input failed: %.1f cm in %.1f seconds"),Travel,Age));return;}
        }
        else if(Stage==21 && Age>.5)
        {
            const FString Directory=FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir()/TEXT("Screenshots"));
            IFileManager::Get().MakeDirectory(*Directory,true);
            FScreenshotRequest::RequestScreenshot(Directory/TEXT("NativeWalkProbe.png"),true,false);
            Finish(Walker->GetCharacterMovement()->IsMovingOnGround(),FString::Printf(TEXT("Bounded %.0fm source-world walk only; several-block walk and final art acceptance remain required"),WalkDistanceMeters));
        }
        return;
    }
    if(!IsValid(Vehicle))return;
    if(Stage==0)
    {
        int32 Cells=0;for(TActorIterator<APhillyDistrict> It(GetWorld());It;++It)Cells=It->ReadyCells;
        if(Cells<20 || !Walker->GetCharacterMovement()->IsMovingOnGround())return;
        if(++WarmFrames<240 || Age<15)return;
        SavedWalker=Walker->GetActorTransform();SavedVehicle=Vehicle->GetActorTransform();
        WalkStart=Walker->GetActorLocation();
        Evidence+=FString::Printf(TEXT("initial_car_controller=%s\n"),*GetNameSafe(Vehicle->GetController()));
        if(UGameplayStatics::DoesSaveGameExist(TEXT("PhiladelphiaMechanicsProbe"),0))
            if(!UGameplayStatics::DeleteGameInSlot(TEXT("PhiladelphiaMechanicsProbe"),0)){Finish(false,TEXT("Could not reset isolated probe save"));return;}
        Evidence+=FString::Printf(TEXT("initial_walker=%s initial_car=%s distance_cm=%.1f car_speed_kmh=%.2f\n"),*WalkStart.ToString(),*Vehicle->GetActorLocation().ToString(),FVector::Dist(WalkStart,Vehicle->GetActorLocation()),Vehicle->SpeedKmh());
        Pulse(EKeys::F5);Next(1,TEXT("Ready on source collision; pressed F5 in probe save slot"));
    }
    else if(Stage==1 && Age>.5)
    {
        if(!UGameplayStatics::DoesSaveGameExist(TEXT("PhiladelphiaMechanicsProbe"),0)){Finish(false,TEXT("F5 did not create probe save"));return;}
        Key(EKeys::D,true);Next(2,TEXT("Walking sideways using D input"));
    }
    else if(Stage==2 && Age>.75)
    {
        Key(EKeys::D,false);
        const double Travel=FVector::DistXY(WalkStart,Walker->GetActorLocation());
        if(Travel<70){Finish(false,FString::Printf(TEXT("Walk input traveled only %.1f cm"),Travel));return;}
        Key(EKeys::A,true);Next(3,FString::Printf(TEXT("Walked %.1f cm; returning with A"),Travel));
    }
    else if(Stage==3 && Age>.75)
    {
        Key(EKeys::A,false);Pulse(EKeys::F);Next(4,TEXT("Pressed F to enter vehicle"));
    }
    else if(Stage==4 && Age>.5)
    {
        if(PC->GetPawn()!=Vehicle){Finish(false,FString::Printf(TEXT("F did not transfer possession; walker=%s car=%s distance=%.1f cm car_speed=%.2f km/h car_rotation=%s"),*Walker->GetActorLocation().ToString(),*Vehicle->GetActorLocation().ToString(),FVector::Dist(Walker->GetActorLocation(),Vehicle->GetActorLocation()),Vehicle->SpeedKmh(),*Vehicle->GetActorRotation().ToString()));return;}
        WalkStart=Walker->GetActorLocation();DriveStart=Vehicle->GetActorLocation();
        Key(EKeys::W,true);Next(5,TEXT("Vehicle possessed; applying throttle through W input"));
    }
    else if(Stage==5 && Age>3)
    {
        const FString Directory=FPaths::ConvertRelativePathToFull(FPaths::ProjectSavedDir()/TEXT("Screenshots"));
        IFileManager::Get().MakeDirectory(*Directory,true);
        FScreenshotRequest::RequestScreenshot(Directory/TEXT("NativeDrivingProbe.png"),true,false);
        Next(6,FString::Printf(TEXT("Driving: distance %.1f cm, speed %.1f km/h, pitch %.1f, roll %.1f"),FVector::DistXY(DriveStart,Vehicle->GetActorLocation()),Vehicle->SpeedKmh(),Vehicle->GetActorRotation().Pitch,Vehicle->GetActorRotation().Roll));
    }
    else if(Stage==6 && Age>1)
    {
        Key(EKeys::W,false);Key(EKeys::SpaceBar,true);
        const double Travel=FVector::DistXY(DriveStart,Vehicle->GetActorLocation());
        const double HiddenDrop=WalkStart.Z-Walker->GetActorLocation().Z;
        Evidence+=FString::Printf(TEXT("drive_cm=%.1f hidden_walker_drop_cm=%.1f\n"),Travel,HiddenDrop);
        if(Travel<200){Finish(false,TEXT("Vehicle failed to drive two metres"));return;}
        if(FMath::Abs(HiddenDrop)>10){Finish(false,TEXT("Hidden walker moved vertically while driving"));return;}
        if(FMath::Abs(Vehicle->GetActorRotation().Roll)>25){Finish(false,TEXT("Vehicle rolled excessively"));return;}
        Next(7,TEXT("Braking with Space input"));
    }
    else if(Stage==7 && Age>3)
    {
        if(Vehicle->SpeedKmh()>2){Finish(false,TEXT("Handbrake did not stop vehicle"));return;}
        // Deliberately hold Space across possession; its release reaches the walker.
        Pulse(EKeys::F);Next(8,TEXT("Pressed F to exit stopped vehicle while holding handbrake"));
    }
    else if(Stage==8 && Age>.75)
    {
        if(PC->GetPawn()!=Walker || Walker->IsHidden() || !Walker->GetActorEnableCollision() || !Walker->GetCharacterMovement()->IsMovingOnGround())
        {Finish(false,TEXT("Exit did not restore visible grounded walking pawn"));return;}
        Key(EKeys::SpaceBar,false);
        Next(10,TEXT("Released handbrake while walking; waiting before re-entry"));
    }
    else if(Stage==10 && Age>.25)
    {
        Pulse(EKeys::F);Next(11,TEXT("Pressed F to re-enter after releasing Space on foot"));
    }
    else if(Stage==11 && Age>.5)
    {
        if(PC->GetPawn()!=Vehicle){Finish(false,TEXT("Could not re-enter stopped vehicle"));return;}
        DriveStart=Vehicle->GetActorLocation();
        Key(EKeys::W,true);Next(12,TEXT("Driving again through W input after handbrake exit"));
    }
    else if(Stage==12 && Age>3)
    {
        Key(EKeys::W,false);Key(EKeys::SpaceBar,true);
        const double Travel=FVector::DistXY(DriveStart,Vehicle->GetActorLocation());
        Evidence+=FString::Printf(TEXT("reentry_drive_cm=%.1f speed_kmh=%.2f\n"),Travel,Vehicle->SpeedKmh());
        if(Travel<200 || Vehicle->SpeedKmh()<2)
        {Finish(false,TEXT("Vehicle could not drive after handbrake was released on foot"));return;}
        Next(13,TEXT("Re-entry drive passed two metres; braking again"));
    }
    else if(Stage==13 && Age>3)
    {
        if(Vehicle->SpeedKmh()>2){Finish(false,TEXT("Handbrake did not stop re-entry drive"));return;}
        Key(EKeys::SpaceBar,false);Pulse(EKeys::F);Next(14,TEXT("Exiting after re-entry drive"));
    }
    else if(Stage==14 && Age>.75)
    {
        if(PC->GetPawn()!=Walker || Walker->IsHidden() || !Walker->GetActorEnableCollision() || !Walker->GetCharacterMovement()->IsMovingOnGround())
        {Finish(false,TEXT("Second exit did not restore visible grounded walking pawn"));return;}
        Pulse(EKeys::F9);Next(9,TEXT("Restoring original F5 state after repeated drive/exit"));
    }
    else if(Stage==9 && Age>.75)
    {
        const double WalkError=FVector::Dist(Walker->GetActorLocation(),SavedWalker.GetLocation());
        const double CarError=FVector::Dist(Vehicle->GetActorLocation(),SavedVehicle.GetLocation());
        Evidence+=FString::Printf(TEXT("restore_walker_error_cm=%.2f restore_vehicle_error_cm=%.2f\n"),WalkError,CarError);
        Finish(PC->GetPawn()==Walker && WalkError<15 && CarError<30,TEXT("Short walk/drive/handbrake-exit/re-entry/save probe; sustained driving, steering, reverse and final-quality acceptance still required"));
    }
}
