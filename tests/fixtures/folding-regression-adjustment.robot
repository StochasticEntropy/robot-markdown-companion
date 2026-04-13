*** Settings ***
Resource            Demo/Core.resource
Resource            Demo/UI.resource
Resource            Demo/App.resource

Test Setup          DEMO Setup    Core    UI
Test Teardown       DEMO Teardown    Core    UI

Test Tags
...    Integration   DemoCore    DemoUI


*** Test Cases ***
T001 Synthetic Balance Adjustment Scenario
    # [Documentation]
    # ...    # E001 Synthetic balance adjustment through demo UI
    # ...
    # ...    ## Goal
    # ...
    # ...    Demonstrate that a completed sample case with an open balance can be adjusted from the demo UI,
    # ...    that the default amount is shown, that the result is stored, and that follow-up validation states
    # ...    are still enforced after a partial reduction.
    # ...
    # ...    ## Flow
    # ...
    # ...    ### Prepare sample overage in backend
    # ...
    # ...    - A synthetic sample case is created in the backend and then closed by a later lifecycle event.
    # ...    - Several background cycles run until the balance is visible to the UI.
    # ...      -> The UI can display the case as a completed sample with an open balance.
    # ...
    # ...    ### Open the case in the UI and trigger a manual adjustment
    # ...
    # ...    - The case is searched in the demo UI and opened in the detail view.
    # ...    - The manual adjustment form is opened.
    # ...    - A reason is selected and the amount is changed to `474,05`.
    # ...    - Saving confirms that the async processing has started.
    # ...    - Afterwards the background cycle is executed again.
    # ...      -> The visible row, the available reasons, and the prefilled amount are shown.
    # ...      -> The partial adjustment is initiated by the UI and processed downstream.
    # ...
    # ...    ### Verify the result after the first partial adjustment
    # ...
    # ...      -> The adjustment is verified in backend storage with the expected amount and reason.
    # ...      -> The downstream ledger view is also verified.
    # ...      -> Reloading the UI shows only a one-cent remainder.
    # ...
    # ...    ### Verify validation boundaries
    # ...
    # ...    - The final cent is also stored as an adjustment.
    # ...    - Another invalid direction is attempted afterwards.
    # ...    - After the next background cycle the case is loaded again.
    # ...      -> The UI rejects the invalid direction while an open balance exists.
    # ...      -> The UI validates amount direction and lower bound.
    # ...      -> Finally the case is shown as balanced at `0,00`.
    [Tags]
    ...    demo     balance     adjustment     ledger     manualForm     lifecycleStop     event
    ...    DEMO-1001

    ${caseType}=                                  Set Variable  STANDARD
    ${productCode}=                               Set Variable  DEMO_PRODUCT
    ${planCode}=                                  Set Variable  PLAN_ALPHA
    ${partnerCode}=                               Set Variable  11112222
    ${externalRef}=                               Set Variable  99887766

    ${startDate}=                                 Set Variable  10.10.2024
    ${reviewDate}=                                Set Variable  11.10.2024
    ${effectiveDate}=                             Set Variable  01.07.2024

    ${closingEventDate}=                          Set Variable  23.03.2025
    ${closeEffectiveDate}=                        Set Variable  31.03.2025
    ${closeExecutionDate}=                        Set Variable  02.04.2025

    #> ## Flow
    #> ### Prepare synthetic case in backend
    #> - Disable the demo mock switch so the UI can see seeded records
    Demo Mock Control     DemoUi=No

    ${user}=    Demo Create Synthetic User

    ${request}=    Demo Write Sample Request
    ...    userId=${user.userId}
    ...    partnerCode=${partnerCode}
    ...    createdOn=${startDate}
    ...    caseType=${caseType}
    ...    productCode=${productCode}

    TEST Date Set    ${reviewDate}

    #> - Execute the initial sample run
    ${initialRun}=   Demo Execute Initial Run - RestCall
    ...    userId=${user.userId}
    ...    requestId=${request.RequestId}
    ...    contractId=${request.ContractId}
    ...    effectiveDate=${effectiveDate}
    ...    endsAt=${NONE}
    ...    productCode=${productCode}
    ...    caseType=${caseType}
    ...    baseAmount=180,00
    ...    extraAmountOne=10,00
    ...    extraAmountTwo=10,00
    ...    employerAmount=200,00
    ...    runFrequency=QUARTERLY
    ...    scenarioType=FULL_SAMPLE_CASE
    ...    planCode=${planCode}
    ...    audienceType=SAMPLE_AUDIENCE
    ...    regionType=SAMPLE_REGION

    Demo Background Cycle For Initial Run
    ...    sampleUser=${user}
    ...    initialRun=${initialRun}
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}
    ...    effectiveDate=${effectiveDate}
    ...    partnerCode=${partnerCode}
    ...    externalRef=${externalRef}
    ...    productCode=${productCode}
    ...    queueCode=1
    ...    dutyMarker=2
    ...    multiSource=2
    ...    thresholdMarker=1
    ...    thresholdAmount=0,00
    ...    maximumAmount=0,00
    ...    updateMarker=YES
    ...    exportLedger=Yes

    ${recordNumber}=  Demo Lookup Record Number
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}
    ${recordId}=  Demo Lookup Record Id
    ...    contractId=${request.ContractId}
    ...    sampleUserId=${user.userId}

    #> - A later lifecycle event creates a visible overage
    Test Date Set    ${closeExecutionDate}
    ...   exportLedger=Yes

    Demo Mark Synthetic User Closed
    ...    sampleUserId=${user.userId}
    ...    externalId=${user.externalId}
    ...    eventDate=${closingEventDate}

    ${closeResult}=  Demo Execute Close Case - RestCall
    ...    userId=${user.userId}
    ...    contractId=${request.ContractId}
    ...    closeReason=EVENT
    ...    effectiveDate=${closeEffectiveDate}

    Demo Background Cycle - Generic
    ...    completedBeforeRun=${closeResult}

    Test Date Increase
    ...    exportLedger=Yes

    Demo Background Cycle - Generic
    ...    dispatchUiSignal=No

    #> ### Open case in demo UI and trigger manual adjustment
    #> - The case is searched in the UI and opened in the detail view.
    Demo UI Start
    Demo UI Search Full    userId=${user.userId}

    #>> -> The UI can display the completed case with an open balance.
    Demo UI Navigate To Detail
    Demo UI Verify Detail Row
    ...    requestId=${request.RequestId}
    ...    activeRange=${effectiveDate} - ${closeEffectiveDate}
    ...    endState=-
    ...    transitionMarker=-
    ...    caseType=Standard
    ...    amountLabel=-
    ...    runFrequency=Quarterly
    ...    status=Completed
    ...    balance=-474,06 EUR
    ...    balanceHover=Open balance
    ...    row=1
    Demo UI Navigate To Edit
    Demo UI Edit Verify Visible     visible=Yes
    #> - The manual adjustment form is opened.
    Demo UI Edit Enter
    ...    activity=Manual ledger adjustment
    Demo UI Edit Verify Reasons
    ...    reason=Please choose|Refund main account|Reverse refund main account|Store hold|Reverse store hold|Manual adjustment|Reverse manual adjustment
    Demo UI Edit Enter
    ...    reason=Manual adjustment
    #> - A reason is selected and the amount is changed to `474,05`.
    #>> -> The visible row, the available reasons, and the prefilled amount are shown.
    Demo UI Edit Verify Values
    ...    activity=Manual ledger adjustment
    ...    reason=Manual adjustment
    ...    amount=474,06
    Demo UI Edit Enter
    ...    amount=474,05
    Demo UI Message Verify    message=The manual adjustment will not be visible immediately. Please verify the result later.
    #> - Saving confirms that async processing started.
    Demo UI Edit Save
    Demo UI Message Verify    message=Action started; the result will not be visible immediately.

    #> - Afterwards the background cycle runs again.
    #>> -> The partial adjustment is initiated from the UI and processed downstream.
    Demo Background Cycle - Generic
    ...    dispatchUiSignal=No
    ...    exportLedger=Yes


    #> ### Verify result after first partial adjustment
    #>> -> The backend row is verified with the expected amount and reason.
    #>> -> The downstream ledger view is also verified.
    ${entry}=  Demo Verify Booking - DbCall
    ...    entryType=S
    ...    validFrom=01.04.2025
    ...    validUntil=30.06.2025
    ...    status=SENT
    ...    reason=ManualAdjustment
    ...    grossAmount=0,00
    ...    feeOne=0,00
    ...    feeTwo=0,00
    ...    feeThree=0,00
    ...    netAmount=-474,05
    ...    recordId=${recordId}

    Demo Verify Net Share - DbCall
    ...    netAmount=-474,05
    ...    shareType=MANUAL_ADJUSTMENT
    ...    bookingId=${entry[0].id}
    ...    expectedCount=1

    Demo Verify Ledger Entry - DbCall
    ...    bookingId=${entry[0].id}
    ...    validFrom=01.04.2025
    ...    text=Manual adjustment
    ...    accountType=NET_SAMPLE
    ...    mainCode=150
    ...    detailCode=152
    ...    amount=-474,05
    ...    status=OK
    ...    expectedCount=1

    #>> -> Reloading the UI shows only a one-cent remainder.
    Demo UI Page Reload
    Demo UI Verify Detail Row
    ...    requestId=${request.RequestId}
    ...    activeRange=${effectiveDate} - ${closeEffectiveDate}
    ...    endState=-
    ...    transitionMarker=-
    ...    caseType=Standard
    ...    amountLabel=-
    ...    runFrequency=Quarterly
    ...    status=Completed
    ...    balance=-0,01 EUR
    ...    balanceHover=Open balance
    ...    row=1

    Demo UI Navigate To Edit
    Demo UI Edit Verify Visible     visible=Yes
    Demo UI Edit Enter
    ...    activity=Manual ledger adjustment
    ...    reason=Reverse manual adjustment

    Demo UI Edit Verify Validation
    ...    amount=Yes
    ...    message=A reverse adjustment is not allowed while an open balance still exists.

    Demo UI Edit Enter
    ...    activity=Manual ledger adjustment
    ...    reason=Manual adjustment

    #> ### Final cent is also stored so the case balances out
    #> - The remaining cent is saved as a final adjustment.
    Demo UI Edit Verify Values
    ...    activity=Manual ledger adjustment
    ...    reason=Manual adjustment
    ...    amount=0,01

    Demo UI Edit Save

    Test Date Increase
    Demo Background Cycle - Generic
    ...    dispatchUiSignal=No
    ...    exportLedger=Yes

    ${entry}=  Demo Verify Booking - DbCall
    ...    entryType=S
    ...    validFrom=01.04.2025
    ...    validUntil=30.06.2025
    ...    status=SENT
    ...    reason=ManualAdjustment
    ...    grossAmount=0,00
    ...    feeOne=0,00
    ...    feeTwo=0,00
    ...    feeThree=0,00
    ...    netAmount=-0,01
    ...    recordId=${recordId}

    Demo Verify Net Share - DbCall
    ...    netAmount=-0,01
    ...    shareType=MANUAL_ADJUSTMENT
    ...    bookingId=${entry[0].id}
    ...    expectedCount=1

    Demo Verify Ledger Entry - DbCall
    ...    bookingId=${entry[0].id}
    ...    validFrom=01.04.2025
    ...    text=Manual adjustment
    ...    accountType=NET_SAMPLE
    ...    mainCode=150
    ...    detailCode=152
    ...    amount=-0,01
    ...    status=OK
    ...    expectedCount=1

    #> ### Case is now balanced