from pathlib import Path
p=Path('Unreal/Philadelphia/Source/Philadelphia/PhillyMechanicsProbe.h');s=p.read_text().replace('    double WalkDistanceMeters=20;', '    double WalkDistanceMeters=20;\n    double WalkTurnMeters=0,WalkTurnYaw=0,CompletedWalkLeg=0;\n    bool bWalkTurned=false;\n    FVector WalkLegStart=FVector::ZeroVector;');p.write_text(s)
p=Path('Unreal/Philadelphia/Source/Philadelphia/PhillyMechanicsProbe.cpp');s=p.read_text();s=s.replace('        WalkDistanceMeters=FMath::Clamp(Requested,20.0,150.0);','''        WalkDistanceMeters=FMath::Clamp(Requested,20.0,150.0);
    double Turn=0,Yaw=0;
    if(FParse::Value(FCommandLine::Get(),TEXT("PhillyWalkTurnMeters="),Turn)
        && FParse::Value(FCommandLine::Get(),TEXT("PhillyWalkTurnYaw="),Yaw)
        && FMath::IsFinite(Turn) && FMath::IsFinite(Yaw) && Turn>0 && Turn<WalkDistanceMeters)
    {WalkTurnMeters=Turn;WalkTurnYaw=Yaw;}''');s=s.replace('            WalkStart=Walker->GetActorLocation();','            WalkStart=WalkLegStart=Walker->GetActorLocation();',1)
s=s.replace('            const double Travel=FVector::DistXY(WalkStart,Walker->GetActorLocation());','''            const double Travel=CompletedWalkLeg+FVector::DistXY(WalkLegStart,Walker->GetActorLocation());
            if(WalkTurnMeters>0 && !bWalkTurned && Travel>=WalkTurnMeters*100)
            {
                CompletedWalkLeg=Travel;WalkLegStart=Walker->GetActorLocation();bWalkTurned=true;
                FRotator Look=PC->GetControlRotation();Look.Yaw=WalkTurnYaw;PC->SetControlRotation(Look);
                Evidence+=FString::Printf(TEXT("source_route_turn_cm=%s yaw=%.2f cumulative_cm=%.2f\\n"),*WalkLegStart.ToString(),WalkTurnYaw,Travel);
            }''',1);p.write_text(s)
p=Path('Unreal/Philadelphia/Tools/test-south.ps1');s=p.read_text().replace('[int]$WalkMeters=20)', '[int]$WalkMeters=20,[double]$TurnMeters=0,[double]$TurnYaw=0)');s=s.replace("if($ArtReview){$args+='-PhillyMuseumArtReview'}", "if($TurnMeters -gt 0){if($NoWalk -or $TurnMeters -ge $WalkMeters){throw 'Turn must lie within the requested walk'};$args+=('-PhillyWalkTurnMeters='+$TurnMeters);$args+=('-PhillyWalkTurnYaw='+$TurnYaw)}\nif($ArtReview){$args+='-PhillyMuseumArtReview'}");p.write_text(s)
