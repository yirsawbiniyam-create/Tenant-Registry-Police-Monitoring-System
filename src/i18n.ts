export type Lang = 'am' | 'en';

export interface AppStrings {
  langToggle: string;
  systemTitle: string;
  commissionEn: string;
  motto: string;
  footerAttribution: string;
  loadingSystem: string;
  logout: string;

  // Login & Register
  loginTab: string;
  registerTab: string;
  loginHeading: string;
  loginSubtitle: string;
  usernameOrPhoneLabel: string;
  usernameOrPhonePlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  loginButton: string;
  verifyingButton: string;
  newLandlordPrompt: string;
  registerLink: string;
  registerHeading: string;
  registerSubtitle: string;
  fullNameLabel: string;
  phoneUsernameLabel: string;
  regionLabel: string;
  zoneLabel: string;
  cityLabel: string;
  woredaLabel: string;
  kebeleLabel: string;
  selectRegion: string;
  selectZone: string;
  selectCity: string;
  selectWoreda: string;
  selectKebele: string;
  houseNoLabel: string;
  roomCountLabel: string;
  faydaIdLabel: string;
  faydaFrontLabel: string;
  faydaBackLabel: string;
  uploadFront: string;
  uploadBack: string;
  confirmPasswordLabel: string;
  registerSubmitBtn: string;
  registeringBtn: string;
  backToLogin: string;

  // Landlord Portal
  tabRegisterTenant: string;
  tabMyTenants: string;
  tabChangeAddress: string;
  tabHistory: string;
  landlordProfileLabel: string;
  selectedPropertyLabel: string;
  roomsStat: string;
  activeTenantsStat: string;
  totalRecordsStat: string;
  tenantFormTitle: string;
  tenantFormDesc: string;
  entryTypeLabel: string;
  entryNewRoom: string;
  entryReplaceTenant: string;
  selectReplacedTenantLabel: string;
  selectReplacedTenantPlaceholder: string;
  replacementBanner: string;
  tenantNameLabel: string;
  tenantPhoneLabel: string;
  maritalStatusLabel: string;
  singleOption: string;
  marriedOption: string;
  livingArrangementLabel: string;
  aloneOption: string;
  withOthersOption: string;
  occupationLabel: string;
  roomAndDateLabel: string;
  coResidentsTitle: string;
  addBtn: string;
  removeBtn: string;
  policeIdHeading: string;
  faydaIdHeading: string;
  policeDigitalIdLabel: string;
  idFrontLabel: string;
  idBackLabel: string;
  portraitLabel: string;
  reviewBeforeSendBtn: string;
  confirmSendTitle: string;
  confirmSendSubtitle: string;
  backToEditBtn: string;
  sendToPoliceBtn: string;
  sendingBtn: string;
  myTenantsTitle: string;
  myTenantsSubtitle: string;
  addNewTenantBtn: string;
  noTenantsEmpty: string;
  registerFirstTenantBtn: string;
  statusActive: string;
  statusMovedOut: string;
  detailsBtn: string;
  markMovedOutBtn: string;
  closeBtn: string;
  changeAddressTitle: string;
  changeAddressDesc: string;
  saveAddressBtn: string;
  addPropertyTitle: string;
  addPropertyDesc: string;
  addPropertyBtn: string;
  historyTitle: string;
  historySubtitle: string;
  filterAll: string;
  filterTenants: string;
  filterAddress: string;

  // Police & Admin Portal
  navFolders: string;
  navSearch: string;
  navWanted: string;
  navSuspects: string;
  navCriminalRecords: string;
  navStatistics: string;
  navHistory: string;
  navAccountActions: string;
  navAdminSetup: string;

  kpiLandlords: string;
  kpiTenants: string;
  kpiPoliceTenants: string;
  kpiWantedActive: string;
  kpiSuspects: string;
  kpiRepeatOffenders: string;
  kpiArrestedToday: string;
  kpiTotalArrested: string;

  foldersAllCities: string;
  policeTenantsOnlyBtn: string;
  openDossierBtn: string;
  searchHeading: string;
  searchPlaceholder: string;
  photoSearchHeading: string;
  photoSearchDesc: string;
  photoSearchBtn: string;
  wantedFormTitle: string;
  wantedFormDesc: string;
  wantedListTitle: string;
  wantedStatusCaptured: string;
  wantedStatusActive: string;
  suspectsFormTitle: string;
  suspectsFormDesc: string;
  suspectsListTitle: string;
  criminalFormTitle: string;
  criminalFormDesc: string;
  criminalListTitle: string;
  promoteToArrested: string;
  markReleased: string;
  deleteRecordBtn: string;
  printBtn: string;
  crSearchPlaceholder: string;
  crPhotoSearchBtn: string;
  tagAsSuspect: string;
  addCrimeRecordFromDossier: string;
  statusSuspect: string;
  statusArrested: string;
  statusConvicted: string;
  statusReleased: string;

  // Statistics & Exports
  periodWeekly: string;
  periodMonthly: string;
  periodYearly: string;
  periodAll: string;
  allCities: string;
  allWoredas: string;
  allKebeles: string;
  reportTitle: string;
  chartWoredaTitle: string;
  chartKebeleTitle: string;
  chartDailyLiveTitle: string;
  exportWord: string;
  exportExcel: string;
  exportPdf: string;
  exportPpt: string;
  exportPrint: string;

  // Report Generator
  reportGeneratorTitle: string;
  reportGeneratorSubtitle: string;
  customTitleLabel: string;
  dateFromLabel: string;
  dateToLabel: string;
  recordStatusFilterLabel: string;
  includeSectionsLabel: string;
  sectionSummary: string;
  sectionCharts: string;
  sectionAreaTable: string;
  sectionLandlordsTable: string;
  sectionTenantsTable: string;
  sectionCriminalTable: string;
  landlordsReportHeading: string;
  tenantsReportHeading: string;
  criminalReportHeading: string;
}

export const DICT: Record<Lang, AppStrings> = {
  am: {
    langToggle: 'English',
    systemTitle: 'አከራይ ተከራይ መመዝገቢያና ፖሊስ ክትትል ሲስተም',
    commissionEn: 'Benishangul-Gumuz Regional Police Commission',
    motto: '“በጀግንነት መጠበቅ በሰብዓዊነት ማገልገል”',
    footerAttribution: 'ቤኒሻንጉል ጉሙዝ ክልል ፖሊስ ቴክኖሎጂ ማስፋፊያና መረጃ ማዕከል (D.I BY)',
    loadingSystem: 'ሲስተሙን በመጫን ላይ...',
    logout: 'ውጣ',

    loginTab: 'ግባ (Login)',
    registerTab: 'አዲስ አከራይ መመዝገብ (Register)',
    loginHeading: 'ወደ ሲስተሙ መግቢያ',
    loginSubtitle: 'አድሚን፣ ፖሊስ ወይም የተመዘገቡ አከራይ — ዩዘርኔም/ስልክ እና የይለፍ ቃልዎን ያስገቡ',
    usernameOrPhoneLabel: 'ዩዘርኔም ወይም ስልክ ቁጥር',
    usernameOrPhonePlaceholder: 'ዩዘርኔም (ለምሳሌ admin / ኦፊሰር) ወይም ስልክ ቁጥር',
    passwordLabel: 'የይለፍ ቃል (Password)',
    passwordPlaceholder: 'የይለፍ ቃልዎን ያስገቡ',
    loginButton: 'ወደ ሲስተሙ ግባ',
    verifyingButton: 'በማረጋገጥ ላይ...',
    newLandlordPrompt: 'አዲስ አከራይ ነዎት?',
    registerLink: 'እዚህ ይመዝገቡ',
    registerHeading: 'አዲስ አከራይ መመዝገቢያ ፎርም',
    registerSubtitle: 'አከራይ ስለመሆንዎ መረጃ ይሙሉ፤ ከተመዘገቡ በኋላ ሎጊን ብለው በመግባት ተከራዮችን መመዝገብ ይችላሉ።',
    fullNameLabel: 'ሙሉ ስም ከነአያት *',
    phoneUsernameLabel: 'ስልክ ቁጥር (ዩዘርኔም ይሆናል) *',
    regionLabel: 'ክልል *',
    zoneLabel: 'ዞን *',
    cityLabel: 'ከተማ *',
    woredaLabel: 'ወረዳ *',
    kebeleLabel: 'ቀበሌ *',
    selectRegion: 'ክልል ይምረጡ',
    selectZone: 'ዞን ይምረጡ',
    selectCity: 'ከተማ ይምረጡ',
    selectWoreda: 'ወረዳ ይምረጡ',
    selectKebele: 'ቀበሌ ይምረጡ',
    houseNoLabel: 'የቤት ቁጥር *',
    roomCountLabel: 'የቤት/ክፍል ብዛት *',
    faydaIdLabel: 'የፋይዳ መታወቂያ ቁጥር *',
    faydaFrontLabel: 'የፋይዳ መታወቂያ የፊት ገፅ *',
    faydaBackLabel: 'የፋይዳ መታወቂያ የኋላ ገፅ *',
    uploadFront: 'የፊት ገፅ ፎቶ ይጫኑ',
    uploadBack: 'የኋላ ገፅ ፎቶ ይጫኑ',
    confirmPasswordLabel: 'የይለፍ ቃል ያረጋግጡ *',
    registerSubmitBtn: 'ተመዝገብ እና ወደ ሎጊን ቀጥል',
    registeringBtn: 'በመመዝገብ ላይ...',
    backToLogin: 'ቀደም ሲል ተመዝግበዋል? ወደ መግቢያ (Login) ተመለስ',

    tabRegisterTenant: 'ተከራይ መመዝገቢያ',
    tabMyTenants: 'ተከራዮቼ',
    tabChangeAddress: 'ቤት / አድራሻ መቀየሪያ',
    tabHistory: 'የእንቅስቃሴ ታሪክ',
    landlordProfileLabel: 'የተመዘገበ አከራይ መለያ',
    selectedPropertyLabel: 'የተመረጠ ቤት:',
    roomsStat: 'የክፍል ብዛት',
    activeTenantsStat: 'ንቁ ተከራዮች',
    totalRecordsStat: 'ጠቅላላ መዝገብ',
    tenantFormTitle: 'የተከራይ ሙሉ መረጃ መመዝገቢያ ፎርም',
    tenantFormDesc: 'መረጃውን ከሞሉ በኋላ ከመላክዎ በፊት ያረጋግጡ፤ በቀጥታ ለአካባቢዎ ፖሊስ ይደርሳል።',
    entryTypeLabel: 'የኪራይ ሁኔታ ይምረጡ *',
    entryNewRoom: 'አዲስ ቤት / ቀደም ሲል ተከራይ ያልነበረበት ክፍል',
    entryReplaceTenant: 'የወጣ ተከራይን በመተካት (በእሱ ምትክ ሌላ ተከራይ ገባ)',
    selectReplacedTenantLabel: 'በማን ምትክ እንደገባ ከታሪክዎ ይምረጡ *',
    selectReplacedTenantPlaceholder: '-- ቀደም ሲል የተመዘገበ ተከራይ ይምረጡ --',
    replacementBanner: 'የተመረጠው የቀድሞ ተከራይ ለቋል ተብሎ ይመዘገብና አዲሱ ተከራይ በእሱ ምትክ ለፖሊስ ይላካል።',
    tenantNameLabel: 'የተከራይ ሙሉ ስም ከነአያት *',
    tenantPhoneLabel: 'ስልክ ቁጥር *',
    maritalStatusLabel: 'የጋብቻ ሁኔታ *',
    singleOption: 'ያላገባ / ያላገባች',
    marriedOption: 'ባለትዳር',
    livingArrangementLabel: 'የአኗኗር ሁኔታ *',
    aloneOption: 'ብቻውን የሚኖር',
    withOthersOption: 'አብሮት የሚኖሩ ሰዎች አሉ',
    occupationLabel: 'የስራ አይነት *',
    roomAndDateLabel: 'ክፍል / የገባበት ቀን',
    coResidentsTitle: 'አብረውት የሚኖሩ ሰዎች ስም ዝርዝር',
    addBtn: 'ጨምር',
    removeBtn: 'አጥፋ',
    policeIdHeading: 'የፖሊስ ዲጅታል መታወቂያ (ተከራዩ ፖሊስ ስለሆነ)',
    faydaIdHeading: 'የፋይዳ መታወቂያ መረጃ',
    policeDigitalIdLabel: 'የፖሊስ ዲጅታል መታወቂያ ቁጥር *',
    idFrontLabel: 'የመታወቂያ የፊት ገፅ *',
    idBackLabel: 'የመታወቂያ የኋላ ገፅ *',
    portraitLabel: 'የተከራይ ፎቶ',
    reviewBeforeSendBtn: 'ከመላክዎ በፊት መረጃውን ፈትሽ (Review)',
    confirmSendTitle: 'ከመላክዎ በፊት መረጃውን ያረጋግጡ',
    confirmSendSubtitle: 'ሁሉም መረጃዎች ትክክል ከሆኑ ብቻ ወደ ፖሊስ ይላኩ።',
    backToEditBtn: 'ተመልሰህ አስተካክል',
    sendToPoliceBtn: 'ትክክል ነው — ለፖሊስ ላክ',
    sendingBtn: 'በመላክ ላይ...',
    myTenantsTitle: 'የተመዘገቡ ተከራዮች ዝርዝር',
    myTenantsSubtitle: 'በራስዎ ቤት የተመዘገቡና ለፖሊስ የተላኩ ተከራዮች ብቻ',
    addNewTenantBtn: 'አዲስ ተከራይ ጨምር',
    noTenantsEmpty: 'እስካሁን የተመዘገበ ተከራይ የለም',
    registerFirstTenantBtn: 'የመጀመሪያ ተከራይ ይመዝግቡ',
    statusActive: 'በመኖር ላይ',
    statusMovedOut: 'ለቋል',
    detailsBtn: 'ዝርዝር',
    markMovedOutBtn: 'ለቋል ብለህ መዝግብ',
    closeBtn: 'ዝጋ',
    changeAddressTitle: 'የአከራይ ቤት እና አድራሻ መቀየሪያ',
    changeAddressDesc: 'ቤት ሲቀይሩ አዲሱን ከተማ፣ ወረዳ፣ ቀበሌ እና የቤት ቁጥር ይሙሉ፤ ታሪኩ ይቀመጣል።',
    saveAddressBtn: 'አዲሱን አድራሻ አስቀምጥ',
    addPropertyTitle: 'አዲስ ተጨማሪ የኪራይ ቤት መመዝገቢያ',
    addPropertyDesc: 'ሌላ የሚያከራዩት ቤት ወይም ህንፃ ካለ በቀጥታ ከገፁ ውስጥ መዝግበው ተከራዮችን መላክ ይችላሉ።',
    addPropertyBtn: 'ተጨማሪ የኪራይ ቤት መዝግብ',
    historyTitle: 'የአከራይና ተከራይ እንቅስቃሴ ታሪክ',
    historySubtitle: 'የራስዎ የተከራይ ምዝገባዎች፣ ምትኮች፣ የለቀቁ ተከራዮች እና የአድራሻ ለውጦች ብቻ',
    filterAll: 'ሁሉም',
    filterTenants: 'ተከራዮች',
    filterAddress: 'ቤት / አድራሻ',

    navFolders: 'የአድራሻ ፎልደሮች',
    navSearch: 'ፍለጋ (ስም / ፋይዳ / ፎቶ)',
    navWanted: 'ተፈላጊ ሰዎች (Wanted)',
    navSuspects: 'የተጠርጣሪዎች መዝገብ',
    navCriminalRecords: 'የእስርና ወንጀል ሪከርድ',
    navStatistics: 'ስታቲስቲክስና ሪፖርት',
    navHistory: 'የእንቅስቃሴ ታሪክ',
    navAccountActions: 'ተጠቃሚ / ፓስዎርድ / አከራይ',
    navAdminSetup: 'የአድሚን ማስተዳደሪያ',

    kpiLandlords: 'ጠቅላላ አከራዮች',
    kpiTenants: 'ጠቅላላ ተከራዮች',
    kpiPoliceTenants: 'የፖሊስ አባል ተከራዮች',
    kpiWantedActive: 'በህግ የሚፈለጉ',
    kpiSuspects: 'ተጠርጣሪዎች',
    kpiRepeatOffenders: 'ደጋጋሚ ወንጀለኞች',
    kpiArrestedToday: 'ዛሬ የታሰሩ (Live)',
    kpiTotalArrested: 'ጠቅላላ የታሰሩ',

    foldersAllCities: 'ሁሉም ከተሞች',
    policeTenantsOnlyBtn: 'የፖሊስ ዲጅታል መታወቂያ ተከራዮች ብቻ',
    openDossierBtn: 'ማህደር ክፈት',
    searchHeading: 'በስም፣ በስልክ ወይም በፋይዳ/ፖሊስ መታወቂያ ቁጥር ፍለጋ',
    searchPlaceholder: 'ሙሉ ስም፣ ስልክ ቁጥር ወይም የፋይዳ ቁጥር ያስገቡ...',
    photoSearchHeading: 'በፎቶ መፈለጊያ',
    photoSearchDesc: 'የሚፈለገውን ሰው ፎቶ ይጫኑ፤ ሲስተሙ ከተመዘገቡ ፎቶዎች ጋር አነጻጽሮ ያመጣል።',
    photoSearchBtn: 'በፎቶ ፈልግ',
    wantedFormTitle: 'በህግ የሚፈለግ ሰው መመዝገቢያ (ምስጢራዊ)',
    wantedFormDesc: 'ፎቶ፣ ስም፣ ስልክ ወይም ፋይዳ ቁጥር በመሙላት በተፈላጊ ሰሌዳ ላይ ያውጡ። አከራዮች ዘንድ አይታይም።',
    wantedListTitle: 'የተፈላጊ ሰዎች ሰሌዳ (Wanted Poster Board)',
    wantedStatusCaptured: 'ተይዟል',
    wantedStatusActive: 'በፍለጋ ላይ',
    suspectsFormTitle: 'የተጠርጣሪዎች መመዝገቢያ (Suspects Registry)',
    suspectsFormDesc: 'በጥርጣሬ ላይ ያሉ ግለሰቦችን ከነፎቶአቸው፣ ስልካቸውና አድራሻቸው ለየብቻ ይመዝግቡ።',
    suspectsListTitle: 'የተመዘገቡ ተጠርጣሪዎች ዝርዝር',
    criminalFormTitle: 'የእስር እና የወንጀል ሪከርድ መመዝገቢያ',
    criminalFormDesc: 'የታሰሩ እና የተፈረደባቸውን ሰዎች ቀን በቀን ከነሙሉ ማህደርና ፎቶ ይመዝግቡ።',
    criminalListTitle: 'የእስርና ወንጀል ሪከርድ መዝገብ',
    promoteToArrested: 'ታስሯል በል',
    markReleased: 'ተፈትቷል በል',
    deleteRecordBtn: 'ሰርዝ',
    printBtn: 'ፕሪንት',
    crSearchPlaceholder: 'በስም፣ በስልክ ወይም በመታወቂያ ቁጥር ሪከርድ ይፈልጉ...',
    crPhotoSearchBtn: 'በፎቶ ሪከርድ ፈልግ',
    tagAsSuspect: 'ተጠርጣሪ በል (Tag Suspect)',
    addCrimeRecordFromDossier: 'የወንጀል/እስር ሪከርድ መዝግብ',
    statusSuspect: 'ተጠርጣሪ',
    statusArrested: 'ታስሯል',
    statusConvicted: 'ተፈርዶበታል',
    statusReleased: 'ተፈትቷል',

    periodWeekly: 'ሳምንታዊ (7 ቀናት)',
    periodMonthly: 'ወርሃዊ (30 ቀናት)',
    periodYearly: 'ዓመታዊ (365 ቀናት)',
    periodAll: 'ሁሉም ጊዜ',
    allCities: 'ሁሉም ከተሞች',
    allWoredas: 'ሁሉም ወረዳዎች',
    allKebeles: 'ሁሉም ቀበሌዎች',
    reportTitle: 'የአከራይ ተከራይ እና የወንጀል ክትትል ስታቲስቲክስ ሪፖርት',
    chartWoredaTitle: 'በየወረዳው የአከራይና ተከራዮች ብዛት (Woreda Chart)',
    chartKebeleTitle: 'በየቀበሌው የአከራይና ተከራዮች ብዛት (Kebele Chart)',
    chartDailyLiveTitle: 'ዕለታዊ የምዝገባና የእስር እንቅስቃሴ (Live Daily Trend)',
    exportWord: 'Word (.docx)',
    exportExcel: 'Excel (.xlsx)',
    exportPdf: 'PDF (.pdf)',
    exportPpt: 'PowerPoint (.pptx)',
    exportPrint: 'ፕሪንት (Print)',

    reportGeneratorTitle: 'የሪፖርት ማመንጫ (Report Generator)',
    reportGeneratorSubtitle: 'የአከራይ/ተከራይ ስታቲስቲክስ እና የወንጀል/ተጠርጣሪ ሪከርዶችን መርጠው በPDF፣ በExcel ወይም በWord ያውርዱ።',
    customTitleLabel: 'የሪፖርት ርዕስ (አማራጭ)',
    dateFromLabel: 'ከቀን ጀምሮ',
    dateToLabel: 'እስከ ቀን',
    recordStatusFilterLabel: 'የወንጀል ሪከርድ ሁኔታ',
    includeSectionsLabel: 'በሪፖርቱ ውስጥ የሚካተቱ ክፍሎች',
    sectionSummary: 'ዋና ማጠቃለያ (KPIs)',
    sectionCharts: 'ስታቲስቲክስ ግራፎች',
    sectionAreaTable: 'በወረዳ/ቀበሌ ሰንጠረዥ',
    sectionLandlordsTable: 'የአከራዮች ዝርዝር',
    sectionTenantsTable: 'የተከራዮች ዝርዝር',
    sectionCriminalTable: 'የወንጀልና የተጠርጣሪ ሪከርዶች',
    landlordsReportHeading: 'የተመዘገቡ አከራዮች ዝርዝር',
    tenantsReportHeading: 'የተመዘገቡ ተከራዮች ዝርዝር',
    criminalReportHeading: 'የእስር፣ የተጠርጣሪ እና የወንጀል ሪከርዶች ዝርዝር',
  },
  en: {
    langToggle: 'አማርኛ',
    systemTitle: 'Landlord-Tenant Registry & Police Monitoring System',
    commissionEn: 'Benishangul-Gumuz Regional Police Commission',
    motto: '“Protect with Valor, Serve with Humanity”',
    footerAttribution: 'Benishangul-Gumuz Regional Police Technology Expansion & Information Center (D.I BY)',
    loadingSystem: 'Loading system...',
    logout: 'Sign Out',

    loginTab: 'Login',
    registerTab: 'Landlord Register',
    loginHeading: 'Unified System Sign In',
    loginSubtitle: 'Admin, Police Officer, or Registered Landlord — enter your username/phone & password',
    usernameOrPhoneLabel: 'Username or Phone Number',
    usernameOrPhonePlaceholder: 'Username (e.g. admin / officer) or phone number',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Enter your password',
    loginButton: 'Sign In',
    verifyingButton: 'Verifying...',
    newLandlordPrompt: 'New landlord?',
    registerLink: 'Register here',
    registerHeading: 'New Landlord Registration Form',
    registerSubtitle: 'Submit your property owner details and Fayda ID, then log in to register tenants.',
    fullNameLabel: 'Full Name (with Grandfather) *',
    phoneUsernameLabel: 'Phone Number (Login Username) *',
    regionLabel: 'Region *',
    zoneLabel: 'Zone *',
    cityLabel: 'City *',
    woredaLabel: 'Woreda *',
    kebeleLabel: 'Kebele *',
    selectRegion: 'Select Region',
    selectZone: 'Select Zone',
    selectCity: 'Select City',
    selectWoreda: 'Select Woreda',
    selectKebele: 'Select Kebele',
    houseNoLabel: 'House Number *',
    roomCountLabel: 'Houses / Rooms Count *',
    faydaIdLabel: 'Fayda ID Number *',
    faydaFrontLabel: 'Fayda ID Front Photo *',
    faydaBackLabel: 'Fayda ID Back Photo *',
    uploadFront: 'Upload Front ID Photo',
    uploadBack: 'Upload Back ID Photo',
    confirmPasswordLabel: 'Confirm Password *',
    registerSubmitBtn: 'Register & Continue to Login',
    registeringBtn: 'Registering...',
    backToLogin: 'Already registered? Back to Login',

    tabRegisterTenant: 'Register Tenant',
    tabMyTenants: 'My Tenants',
    tabChangeAddress: 'House / Address',
    tabHistory: 'Activity History',
    landlordProfileLabel: 'Registered Landlord Account',
    selectedPropertyLabel: 'Selected Property:',
    roomsStat: 'Rooms',
    activeTenantsStat: 'Active Tenants',
    totalRecordsStat: 'Total Records',
    tenantFormTitle: 'Tenant Registration Form',
    tenantFormDesc: 'Verify details before sending; submissions route directly to your local Police jurisdiction.',
    entryTypeLabel: 'Rental Entry Mode *',
    entryNewRoom: 'New House / Previously Unoccupied Room',
    entryReplaceTenant: 'Replacing Previous Tenant (Select from Your History)',
    selectReplacedTenantLabel: 'Select Outgoing Tenant Being Replaced *',
    selectReplacedTenantPlaceholder: '-- Select previous tenant from your history --',
    replacementBanner: 'The selected outgoing tenant will be marked as moved out and the new tenant will be logged as their replacement.',
    tenantNameLabel: 'Tenant Full Name *',
    tenantPhoneLabel: 'Phone Number *',
    maritalStatusLabel: 'Marital Status *',
    singleOption: 'Single',
    marriedOption: 'Married',
    livingArrangementLabel: 'Living Arrangement *',
    aloneOption: 'Living Alone',
    withOthersOption: 'Living with Co-residents',
    occupationLabel: 'Occupation *',
    roomAndDateLabel: 'Room / Move-in Date',
    coResidentsTitle: 'Co-residents Names',
    addBtn: 'Add',
    removeBtn: 'Remove',
    policeIdHeading: 'Police Digital ID (Police Officer Tenant)',
    faydaIdHeading: 'Fayda ID Information',
    policeDigitalIdLabel: 'Police Digital ID Number *',
    idFrontLabel: 'ID Front Photo *',
    idBackLabel: 'ID Back Photo *',
    portraitLabel: 'Tenant Portrait Photo',
    reviewBeforeSendBtn: 'Review Details Before Sending',
    confirmSendTitle: 'Verify Information Before Sending',
    confirmSendSubtitle: 'Confirm all details are accurate before routing to Police.',
    backToEditBtn: 'Back to Edit',
    sendToPoliceBtn: 'Confirmed — Send to Police',
    sendingBtn: 'Sending...',
    myTenantsTitle: 'My Registered Tenants',
    myTenantsSubtitle: 'Only tenants registered under your own property',
    addNewTenantBtn: 'Add New Tenant',
    noTenantsEmpty: 'No tenants registered yet',
    registerFirstTenantBtn: 'Register First Tenant',
    statusActive: 'Active',
    statusMovedOut: 'Moved Out',
    detailsBtn: 'Details',
    markMovedOutBtn: 'Mark Moved Out',
    closeBtn: 'Close',
    changeAddressTitle: 'Update Landlord House & Address',
    changeAddressDesc: 'Update city, woreda, kebele, or house number; all changes are logged in history.',
    saveAddressBtn: 'Save Updated Address',
    addPropertyTitle: 'Register Additional Rental House',
    addPropertyDesc: 'Add another rental house or building directly from your dashboard.',
    addPropertyBtn: 'Register Additional Property',
    historyTitle: 'My Landlord & Tenant Activity History',
    historySubtitle: 'Strictly your own tenant registrations, replacements, move-outs, and address updates',
    filterAll: 'All',
    filterTenants: 'Tenants',
    filterAddress: 'House / Address',

    navFolders: 'Address Folders',
    navSearch: 'Search (Name / ID / Photo)',
    navWanted: 'Wanted Board',
    navSuspects: 'Suspects Registry',
    navCriminalRecords: 'Arrest & Crime Records',
    navStatistics: 'Statistics & Reports',
    navHistory: 'Audit History',
    navAccountActions: 'Users / Passwords / Transfer',
    navAdminSetup: 'Admin Settings & Logo',

    kpiLandlords: 'Total Landlords',
    kpiTenants: 'Total Tenants',
    kpiPoliceTenants: 'Police Tenants',
    kpiWantedActive: 'Wanted Persons',
    kpiSuspects: 'Suspects',
    kpiRepeatOffenders: 'Repeat Offenders',
    kpiArrestedToday: 'Arrested Today (Live)',
    kpiTotalArrested: 'Total Arrested',

    foldersAllCities: 'All Cities',
    policeTenantsOnlyBtn: 'Police Digital ID Tenants Only',
    openDossierBtn: 'Open Dossier',
    searchHeading: 'Search by Name, Phone, or Fayda/Police ID',
    searchPlaceholder: 'Enter full name, phone, or ID number...',
    photoSearchHeading: 'Photo Similarity Search',
    photoSearchDesc: 'Upload a person photo to match against registered portraits, IDs, wanted posters, and records.',
    photoSearchBtn: 'Search by Photo',
    wantedFormTitle: 'Register Wanted Person (Confidential)',
    wantedFormDesc: 'Provide photo, name, phone, or Fayda ID to publish to the Police Wanted Board.',
    wantedListTitle: 'Wanted Persons Poster Board',
    wantedStatusCaptured: 'Captured',
    wantedStatusActive: 'Active Search',
    suspectsFormTitle: 'Suspects Registry (Dedicated)',
    suspectsFormDesc: 'Register individuals under suspicion separately with photo, phone, and address.',
    suspectsListTitle: 'Registered Suspects List',
    criminalFormTitle: 'Arrest & Criminal Records',
    criminalFormDesc: 'Log arrests and convictions with full case details and photo for live daily tracking.',
    criminalListTitle: 'Arrest & Criminal Records Ledger',
    promoteToArrested: 'Mark Arrested',
    markReleased: 'Mark Released',
    deleteRecordBtn: 'Delete',
    printBtn: 'Print',
    crSearchPlaceholder: 'Search criminal records by name, phone, or ID...',
    crPhotoSearchBtn: 'Search Records by Photo',
    tagAsSuspect: 'Tag as Suspect',
    addCrimeRecordFromDossier: 'Record Arrest / Crime',
    statusSuspect: 'Suspect',
    statusArrested: 'Arrested',
    statusConvicted: 'Convicted',
    statusReleased: 'Released',

    periodWeekly: 'Weekly (7 Days)',
    periodMonthly: 'Monthly (30 Days)',
    periodYearly: 'Yearly (365 Days)',
    periodAll: 'All Time',
    allCities: 'All Cities',
    allWoredas: 'All Woredas',
    allKebeles: 'All Kebeles',
    reportTitle: 'Landlord-Tenant & Crime Monitoring Statistical Report',
    chartWoredaTitle: 'Landlords & Tenants by Woreda',
    chartKebeleTitle: 'Landlords & Tenants by Kebele',
    chartDailyLiveTitle: 'Live Daily Registrations & Arrests',
    exportWord: 'Word (.docx)',
    exportExcel: 'Excel (.xlsx)',
    exportPdf: 'PDF (.pdf)',
    exportPpt: 'PowerPoint (.pptx)',
    exportPrint: 'Print',

    reportGeneratorTitle: 'Report Generator',
    reportGeneratorSubtitle: 'Customize and export Landlord/Tenant statistics and Criminal Records to PDF, Excel, or Word.',
    customTitleLabel: 'Report Title (Optional)',
    dateFromLabel: 'From Date',
    dateToLabel: 'To Date',
    recordStatusFilterLabel: 'Criminal Record Status',
    includeSectionsLabel: 'Include Sections in Report',
    sectionSummary: 'Executive Summary KPIs',
    sectionCharts: 'Visual Charts',
    sectionAreaTable: 'Area Breakdown Tables',
    sectionLandlordsTable: 'Landlords Registry',
    sectionTenantsTable: 'Tenants Registry',
    sectionCriminalTable: 'Criminal & Suspect Records',
    landlordsReportHeading: 'Registered Landlords Directory',
    tenantsReportHeading: 'Registered Tenants Directory',
    criminalReportHeading: 'Criminal & Suspect Records Ledger',
  },
};
