*** Settings ***
Resource            Demo/Keywords.resource

Test Setup          DEMO Setup    Demo
Test Teardown       DEMO Teardown    Demo

Test Tags      DEMO


*** Test Cases ***
T001 Demo Scenario End To End Background Refresh
    [Tags]
    ...    smoke     api     queue     export     files     demoFlow

    ${StartDate}=               Set Variable  2026-01-10
    ${ReviewDate}=              Set Variable  2026-02-05
    ${RunDate}=                 Set Variable  2026-03-01
    # ${ProcessDate}=                 Set Variable  2026-01-01
    VAR    ${ProcessDate}    2026-01-01
    ${PartnerCode}=             Set Variable  11112222
    ${CaseType}=                Set Variable  STANDARD
    ${ProductCode}=             Set Variable  DEMO
    ${PlanCode}=                Set Variable  PLAN_A
    ${FilePrefix}=              Set Variable  DM-
    ${ExternalRef}=             Set Variable  99887766


    #> ## Test flow

    #> ### Create sample data
    #> 1. Create primary sample record
    ${user}=    Demo Create Sample User

    #> 1. Write request to mock store
    ${request}=    Demo Write Request To Mock Store
    ...    userId=${user.userId}
    ...    partnerCode=${PartnerCode}
    ...    startDate=${StartDate}
    ...    caseType=${CaseType}
    ...    productCode=${ProductCode}

    #> ### Run process and background refresh
    #> - Run process without an end date
    DEMO Set Date    ${ReviewDate}
    ${processResult}=    Demo Execute Sample Process - RestCall
    ...    userId=${user.userId}
    ...    requestId=${request.RequestId}
    ...    contractId=${request.ContractId}
    ...    processDate=${ProcessDate}
    ...    endsAt=${NONE}
    ...    productCode=${ProductCode}
    ...    planCode=${PlanCode}
    ...    caseType=${CaseType}
    ...    sampleAmount=90,00
    ...    reserveAmount=10,00
    ...    demoFlag=100,00

    #> - Run background refresh with synthetic input
    #> - Refresh queue with code 1 and update markers
    ${backgroundResult}=    Demo Run Background Refresh
    ...    sampleUser=${user}
    ...    processResult=${processResult}
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}
    ...    effectiveDate=${ProcessDate}
    ...    partnerCode=${PartnerCode}
    ...    externalRef=${ExternalRef}
    ...    refreshCode=1
    ...    queueState=2
    ...    multiSource=PRIMARY
    ...    syntheticMarker=1
    ...    syntheticAmount=0,00
    ...    maxValue=0,00
    ...    updateState=YES
    #> ### Review generated records
    ${RecordNumber}=    Demo Lookup Record Number
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}

    #> - first level
    ${RecordId}=    Demo Lookup Record Id
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}

    #>> - Check database rows and rest calls
    Demo Check Queue Table - DbCall
    ...    recordId=${RecordId}
    ...    refreshCode=PROCESS_START
    ...    status=DONE
    ...    createdOn=${ReviewDate}
    ...    sentOn=${ReviewDate}
    ...    effectiveDate=${ProcessDate}
    ...    finishedOn=
    ...    updateMarker=${NONE}
    ...    hasRollback=${False}
    ...    amount=100,00

    #> - next first level
    Demo Check Mirror Table - DbCall
    ...    queueRowId=${None}
    ...    sampleUserId=${user.userId}
    ...    ownerRef=${RecordNumber}
    ...    ownerRefMessage=${RecordNumber}
    ...    eventType=STANDARD_FLOW
    ...    validFrom=${ProcessDate}
    ...    validUntil=${NONE}
    ...    effectiveDate=${ProcessDate}
    ...    completedOn=${NONE}

    Demo Check Mirror Table - RestCallLog
    ...    refreshProcess=${processResult.processId}
    ...    sampleUserId=${user.userId}
    ...    ownerRef=${RecordNumber}
    ...    validFrom=${ProcessDate}
    ...    validUntil=${NONE}
    ...    eventType=STANDARD_FLOW
    ...    effectiveDate=${ProcessDate}
    ...    completedOn=${NONE}
    ...    amount=100,00

    ${LedgerResponse}=    Demo Read Ledger File
    # ...    fileName=${backgroundResult.ledger_files.demo.singleEntry}
    ...    fileName=${backgroundResult}
    ...    contractId=${FilePrefix}${request.ContractId}
    ...    productCode=${ProductCode}

    Demo Verify Ledger Sum By Contract
    ...    ledgerResponse=${LedgerResponse}
    ...    contractId=${FilePrefix}${request.ContractId}

    Demo Verify Ledger Row
    ...    ledgerResponse=${LedgerResponse}
    ...    expectedRows=3
    ...    contractRef=${FilePrefix}${request.ContractId}
    ...    countryCode=DE
    ...    extraMarker=X
    ...    totalAmount=14,60

    #> - Check export file
    #>> -> Check export file Check export file Check export file Check export file Check export file
    ${ExportData}=    Demo Read Export File - RestCall
    ...    exportType=PAYMENT_BATCH
    ...    reviewDate=${ReviewDate}

    Demo Verify Export Row
    ...    exportData=${ExportData}
    ...    sampleUser=${user}
    ...    reviewDate=${ReviewDate}
    ...    regionCode=LOCAL
    ...    recordRef=${RecordNumber}01
    ...    sourceCode=1
    ...    deliveryMode=IB
    ...    eventName=STANDARD
    ...    runDate=${RunDate}
    ...    amount=80,50

    Demo Verify Export Cover Letter
    ...    fileName=${backgroundResult.export_cover_letter}
    ...    batchNumber=1
