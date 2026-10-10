// Reference data for the pilot: real places and people, from public sources.
//
// Every record carries the URLs it was taken from (sourceUrls / sourceUrl) and the date it was
// checked (verifiedOn). Nothing here is measured, simulated or estimated: a fact that could not
// be confirmed from a source is left out or null. The seed (prisma/seed.js) loads this file.
//
// WARDS      BMC administrative wards in the pilot: office, and elected representatives.
//            Representatives are listed as representatives only, never as enforcement authorities.
//            An MLA or MP is listed only where the constituency's overlap with the ward is supported
//            by a source; a vacant corporator seat is omitted.
// PROJECTS   Construction projects that public records show as under way. `coordinateSource` says
//            how the position was obtained and `coordinatePrecision` how exact it is (site, street
//            or locality). A DEMO monitor is attached only at site or street precision.
// DUST_AUTHORITY  Who deals with construction dust and how to complain officially. Each channel has a
//            key (stored with a citizen's official complaint reference) and the page it was checked on.

/** Code of the monitoring area (Locality) that a pilot ward's sites and reports are filed under. */
export const localityCodeFor = (ward) => `MUM-${ward.slug.toUpperCase()}`;

export const WARDS = [
  {
    "code": "K/E",
    "slug": "ke",
    "name": "K/East",
    "areas": "Andheri (East), Jogeshwari (East), Vile Parle (East), Marol",
    "note": "BMC has been splitting K/East into K/North and K/South. Press reports say a K/North office in Poonam Nagar, Jogeshwari (East) has been working since February 2026, but BMC has not published its boundary or contact details, so this map still shows one K/East ward with the Andheri (East) office.",
    "office": {
      "address": "Azad Road, Gundavali, Andheri (E), Mumbai - 400069",
      "phone": "022-26847000 (ward control room)",
      "email": null,
      "latitude": 19.120122,
      "longitude": 72.852398
    },
    "sourceUrls": [
      "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices",
      "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/List%20of%20Emergency%20Contacts.pdf",
      "https://www.freepressjournal.in/amp/mumbai/mumbai-news-bmc-appoints-assistant-commissioner-to-newly-formed-k-north-ward-making-office-operational-after-16-month-wait"
    ],
    "verifiedOn": "2026-10-10",
    "representatives": [
      {
        "role": "CORPORATOR",
        "name": "Mamta Pankaj Yadav",
        "party": "BJP",
        "constituency": "Electoral ward 72",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Lona Rajendrasinh Rawat",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 73",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Vidya Bharat Arya-Kangane",
        "party": "MNS",
        "constituency": "Electoral ward 74",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Pramod Pandurang Sawant",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 75",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Prakash Daulat Musale",
        "party": "BJP",
        "constituency": "Electoral ward 76",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Shivani Shailesh Parab",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 77",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Najia Abdul Jabbar Sofi",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 78",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Mansi Madhukar Juvatkar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 79",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Disha Sunil Yadav",
        "party": "BJP",
        "constituency": "Electoral ward 80",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Kesharben Murji Patel",
        "party": "BJP",
        "constituency": "Electoral ward 81",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Jagadishwari Jagadish Amin",
        "party": "BJP",
        "constituency": "Electoral ward 82",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Sonali Sameer Sabe",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 83",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Anjali Abhijit Samant",
        "party": "BJP",
        "constituency": "Electoral ward 84",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Milind Ramnath Shinde",
        "party": "BJP",
        "constituency": "Electoral ward 85",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Ritesh Kamlesh Rai",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 86",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Anant Nar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Jogeshwari East",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Murji Patel",
        "party": "Shiv Sena",
        "constituency": "Andheri East",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Parag Alavani",
        "party": "BJP",
        "constituency": "Vile Parle",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MP",
        "name": "Ravindra Waikar",
        "party": "Shiv Sena",
        "constituency": "Mumbai North West",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_Maharashtra",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MP",
        "name": "Varsha Gaikwad",
        "party": "Congress",
        "constituency": "Mumbai North Central",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_Maharashtra",
        "verifiedOn": "2026-10-10"
      }
    ]
  },
  {
    "code": "H/E",
    "slug": "he",
    "name": "H/East",
    "areas": "Bandra (East), Khar (East), Santacruz (East)",
    "note": null,
    "office": {
      "address": "Plot No 137, TPS IV, Road No 2, Prabhat Colony, Santacruz (E), Mumbai 400055",
      "phone": "022-26114000 (ward control room)",
      "email": null,
      "latitude": 19.085047,
      "longitude": 72.844526
    },
    "sourceUrls": [
      "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices",
      "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/List%20of%20Emergency%20Contacts.pdf"
    ],
    "verifiedOn": "2026-10-10",
    "representatives": [
      {
        "role": "CORPORATOR",
        "name": "Pooja Vishwanath Mahadeshwar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 87",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Shraveri Sadanand Parab",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 88",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Gitesh Vinayak Raut",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 89",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Tulip Brian Miranda",
        "party": "Congress",
        "constituency": "Electoral ward 90",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Sagun Vasant Naik",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 91",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Mohd. Ibrahim Mohd. Iqbal Qureshi",
        "party": "Congress",
        "constituency": "Electoral ward 92",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Rohini Yogesh Kamble",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 93",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Pragya Deepak Bhutkar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 94",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Hari Jagannath Shastri",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 95",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Ayesha Shams Khan",
        "party": "NCP",
        "constituency": "Electoral ward 96",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Varun Sardesai",
        "party": "Shiv Sena (UBT)",
        "constituency": "Vandre East",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Sanjay Potnis",
        "party": "Shiv Sena (UBT)",
        "constituency": "Kalina",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MP",
        "name": "Varsha Gaikwad",
        "party": "Congress",
        "constituency": "Mumbai North Central",
        "note": null,
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_Maharashtra",
        "verifiedOn": "2026-10-10"
      }
    ]
  },
  {
    "code": "L",
    "slug": "l",
    "name": "L",
    "areas": "Kurla, Saki Naka, Chandivali, Asalpha/Mohili, Nehru Nagar",
    "note": null,
    "office": {
      "address": "Laxmanrao Yadav Market Building, S V Barve Marg, Kurla (W), Mumbai - 400070",
      "phone": "022-26505109 (ward control room)",
      "email": null,
      "latitude": 19.070301,
      "longitude": 72.879041
    },
    "sourceUrls": [
      "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices",
      "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/List%20of%20Emergency%20Contacts.pdf"
    ],
    "verifiedOn": "2026-10-10",
    "representatives": [
      {
        "role": "CORPORATOR",
        "name": "Ashwini Ashok Matekar",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 156",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Sarita Ravindra Mhaske",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 157",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Chitra Somanath Sangle",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 158",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Prakash Devji More",
        "party": "BJP",
        "constituency": "Electoral ward 159",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Kiran Bhau Landge",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 160",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Vijayendra Viju Omkar Shinde",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 161",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Amir Naseem Khan",
        "party": "Congress",
        "constituency": "Electoral ward 162",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Shaila Dilip Lande",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 163",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Harish Bhandirge",
        "party": "BJP",
        "constituency": "Electoral ward 164",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Ashraf Azmi",
        "party": "Congress",
        "constituency": "Electoral ward 165",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Meenal Sanjay Turde",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 166",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Dr. Saman Arshad Azmi",
        "party": "Congress",
        "constituency": "Electoral ward 167",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Dr. Saeeda Khan",
        "party": "NCP",
        "constituency": "Electoral ward 168",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Pravina Manish Morajkar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 169",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Rani Swapnil Yerunkar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 171",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Dilip Lande",
        "party": "Shiv Sena",
        "constituency": "Chandivali",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Mangesh Kudalkar",
        "party": "Shiv Sena",
        "constituency": "Kurla (SC)",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MP",
        "name": "Varsha Gaikwad",
        "party": "Congress",
        "constituency": "Mumbai North Central",
        "note": null,
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_Maharashtra",
        "verifiedOn": "2026-10-10"
      }
    ]
  },
  {
    "code": "S",
    "slug": "s",
    "name": "S",
    "areas": "Bhandup, Vikhroli, Kanjurmarg, Powai",
    "note": null,
    "office": {
      "address": "Lal Bahadur Shastri Marg, Mangatram Petrol Pump, Bhandup (W), Mumbai - 400078",
      "phone": "022-25954000 (ward control room)",
      "email": null,
      "latitude": 19.139008,
      "longitude": 72.930483
    },
    "sourceUrls": [
      "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices",
      "https://portal.mcgm.gov.in/irj/go/km/docs/documents/HomePage%20Data/List%20of%20Emergency%20Contacts.pdf"
    ],
    "verifiedOn": "2026-10-10",
    "representatives": [
      {
        "role": "CORPORATOR",
        "name": "Suresh Atmaram Shinde",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 109",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Asha Suresh Koparkar",
        "party": "Congress",
        "constituency": "Electoral ward 110",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Sakshi Deepak Dalvi",
        "party": "BJP",
        "constituency": "Electoral ward 112",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Deepmala Baban Badhe",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 113",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Rajul Sanjay Patil",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 114",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Jyoti Anil Rajbhoj",
        "party": "MNS",
        "constituency": "Electoral ward 115",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Jagruti Pratik Patil",
        "party": "BJP",
        "constituency": "Electoral ward 116",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Shweta Rajesh Pawasakar",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 117",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Sunita Chandrashekhar Jadhav",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 118",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Rajesh Pandharinath Sonavale",
        "party": "Shiv Sena",
        "constituency": "Electoral ward 119",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Vishwas Tukaram Shinde",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 120",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Priyadarshini Nagesh Thackeray",
        "party": "Shiv Sena (UBT)",
        "constituency": "Electoral ward 121",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "CORPORATOR",
        "name": "Chandan Chittaranjan Sharma",
        "party": "BJP",
        "constituency": "Electoral ward 122",
        "note": null,
        "sourceUrl": "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Municiple%20Secretory/Deliberative%20Wing/Councillors%20list.pdf",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Ashok Patil",
        "party": "Shiv Sena",
        "constituency": "Bhandup West",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MLA",
        "name": "Sunil Raut",
        "party": "Shiv Sena (UBT)",
        "constituency": "Vikhroli",
        "note": "Covers part of this ward",
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Maharashtra_Legislative_Assembly_election",
        "verifiedOn": "2026-10-10"
      },
      {
        "role": "MP",
        "name": "Sanjay Dina Patil",
        "party": "Shiv Sena (UBT)",
        "constituency": "Mumbai North East",
        "note": null,
        "sourceUrl": "https://en.wikipedia.org/wiki/2024_Indian_general_election_in_Maharashtra",
        "verifiedOn": "2026-10-10"
      }
    ]
  }
];

export const PROJECTS = [
  {
    "code": "KE-01",
    "name": "Mumbai Metro Line 6 (Pink Line) - Mahakali Caves station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Station on Mumbai Metro Line 6 (Pink Line), a 15.31 km corridor with 13 stations from Swami Samarth Nagar to Vikhroli (EEH) that follows the Jogeshwari-Vikhroli Link Road through Andheri East and Powai.",
    "address": "Jogeshwari-Vikhroli Link Road, MIDC, Andheri East",
    "latitude": 19.133491,
    "longitude": 72.874678,
    "coordinateSource": "OpenStreetMap node 5219518799 ('Mahakali Caves Station'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, a stop position on the Line 6 alignment under construction",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2026 H2 (MMRDA target as reported by Swarajya on 2026-01-21); the Wikipedia Pink Line article lists December 2028",
    "status": "Under construction; line not yet open to passengers (Free Press Journal, 2026-09-01)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-metro-line-6-may-begin-services-without-full-depot-as-mmrda-plans-temporary-maintenance-facility-at-vikhroli",
      "https://en.wikipedia.org/wiki/Pink_Line_(Mumbai_Metro)",
      "https://swarajyamag.com/amp/story/news-brief/mmrda-clears-way-for-mumbai-metro-line-6-opening-in-second-half-of-2026-without-kanjurmarg-car-depot"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Station name and order are from the Wikipedia Pink Line station table. Status is line-level: the press source confirms the line has not opened, it does not describe this station individually. The two target dates conflict and are both given."
  },
  {
    "code": "KE-02",
    "name": "Mumbai Metro Line 6 (Pink Line) - SEEPZ Village station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Station on Mumbai Metro Line 6 (Pink Line), a 15.31 km corridor with 13 stations from Swami Samarth Nagar to Vikhroli (EEH) that follows the Jogeshwari-Vikhroli Link Road through Andheri East and Powai.",
    "address": "Jogeshwari-Vikhroli Link Road (Adi Shankaracharya Marg), near SEEPZ, Andheri East",
    "latitude": 19.129363,
    "longitude": 72.882645,
    "coordinateSource": "OpenStreetMap node 5219518806 ('SEEPZ Station'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, a stop position on the Line 6 alignment under construction",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2026 H2 (MMRDA target as reported by Swarajya on 2026-01-21); the Wikipedia Pink Line article lists December 2028",
    "status": "Under construction; line not yet open to passengers (Free Press Journal, 2026-09-01)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-metro-line-6-may-begin-services-without-full-depot-as-mmrda-plans-temporary-maintenance-facility-at-vikhroli",
      "https://en.wikipedia.org/wiki/Pink_Line_(Mumbai_Metro)",
      "https://swarajyamag.com/amp/story/news-brief/mmrda-clears-way-for-mumbai-metro-line-6-opening-in-second-half-of-2026-without-kanjurmarg-car-depot"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Official name is SEEPZ Village (Wikipedia station table); the OpenStreetMap node is named 'SEEPZ Station'. Distinct from the already open Line 3 stations 'SEEPZ' and 'Aarey JVLR'. Status is line-level."
  },
  {
    "code": "KE-03",
    "name": "Mumbai Metro Line 6 (Pink Line) - JVLR Junction station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Station on Mumbai Metro Line 6 (Pink Line), a 15.31 km corridor with 13 stations from Swami Samarth Nagar to Vikhroli (EEH) that follows the Jogeshwari-Vikhroli Link Road through Andheri East and Powai.",
    "address": "Jogeshwari-Vikhroli Link Road at the Western Express Highway, Jogeshwari East",
    "latitude": 19.140507,
    "longitude": 72.854008,
    "coordinateSource": "OpenStreetMap node 9132708009 ('JVLR Station'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, a stop position on the Line 6 alignment under construction",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2026 H2 (MMRDA target as reported by Swarajya on 2026-01-21); the Wikipedia Pink Line article lists December 2028",
    "status": "Under construction; line not yet open to passengers (Free Press Journal, 2026-09-01)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-metro-line-6-may-begin-services-without-full-depot-as-mmrda-plans-temporary-maintenance-facility-at-vikhroli",
      "https://en.wikipedia.org/wiki/Pink_Line_(Mumbai_Metro)",
      "https://swarajyamag.com/amp/story/news-brief/mmrda-clears-way-for-mumbai-metro-line-6-opening-in-second-half-of-2026-without-kanjurmarg-car-depot"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Official name is JVLR Junction (Wikipedia station table, interchange with Line 7 Jogeshwari East); the OpenStreetMap node is named 'JVLR Station'. Status is line-level."
  },
  {
    "code": "KE-04",
    "name": "Mumbai Metro Line 7A (Red Line extension) - Airport Colony station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Elevated station on Metro Line 7A, a 3.4 km extension of Line 7 from Andheri East (Gundavali) to CSMIA Terminal 2 with two stations, Airport Colony (elevated) and CSMIA T2 (underground). About 2.5 km of the line is an underground twin tunnel.",
    "address": "Western Express Highway, Bamanwada, Vile Parle East / Andheri East",
    "latitude": 19.105818,
    "longitude": 72.854017,
    "coordinateSource": "OpenStreetMap node 9131712733 ('Airport Colony Station'), fetched through the Overpass API on 2026-10-10; tagged construction:railway=station, network 'Mumbai Metro Line 7A'",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "December 2026 (Wikipedia Red Line station table); no date in the 2026-08-31 press report",
    "status": "Under construction and not open; work on the elevated section near this station has been halted since 2025 pending an Airports Authority of India ruling on structure height (Business Today, 2026-08-31)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.businesstoday.in/bt-tv/whats-hot/video/mumbai-metro-7a-faces-rs250-crore-loss-over-design-lapse-near-airport-construction-halted-552268-2026-08-31",
      "https://en.wikipedia.org/wiki/Red_Line_(Mumbai_Metro)"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. High confidence applies to 'not completed'. Because work on this section is reported halted, on-site activity (and therefore dust) may be low right now. Business Today says up to about 1 km of viaduct may need rebuilding if height relaxation is refused."
  },
  {
    "code": "KE-05",
    "name": "Acenza-Tower D",
    "developer": "Lodha Developers Limited",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "PR1180002600659",
    "description": "Tower D (Wing D) of Acenza by Lodha Developers at Gundavali, Andheri East: 14 sanctioned habitable floors and 55 units, project built-up area 10,946.21 (area figure as printed on the certificate, which prints no unit).",
    "address": "Plot 78A to 78H, Gundavali, Andheri, Mumbai Suburban 400069",
    "latitude": 19.120608,
    "longitude": 72.855412,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2029-12-31",
    "status": "MahaRERA registration valid from 2026-06-04 to 2029-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PR1180002600659&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=63082&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "KE-06",
    "name": "Kalpataru Verbina",
    "developer": "Kalpataru Shubham Enterprises",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "PR1180002501787",
    "description": "Residential building with 9 sanctioned habitable floors and 18 units, project built-up area 2,452.62 (area figure as printed on the certificate, which prints no unit).",
    "address": "Plot 175A/1, 176A/8/1 and 176A/8/2, Majas, Andheri, Mumbai Suburban 400060",
    "latitude": 19.137304,
    "longitude": 72.86821,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2029-12-31",
    "status": "MahaRERA registration valid from 2025-12-15 to 2029-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PR1180002501787&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=58659&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "KE-07",
    "name": "Arkade Pearl 4",
    "developer": "Arkade Developers Ltd",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "P51800079922",
    "description": "Residential (group housing) project by Arkade Developers on plot 418/D, Vile Parle. Floor and unit counts are not printed on the certificate.",
    "address": "Plot 418/D, Vile Parle, Andheri, Mumbai Suburban 400057",
    "latitude": 19.108006,
    "longitude": 72.848331,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "K/E",
    "proposedCompletion": "2027-06-30",
    "status": "MahaRERA registration valid from 2025-04-01 to 2027-06-30",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=P51800079922&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=55035&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "HE-01",
    "name": "Mumbai (Bandra Kurla Complex) high-speed rail station - Mumbai-Ahmedabad High Speed Rail",
    "developer": "National High Speed Rail Corporation Limited (NHSRCL); contractor MEIL-HCC joint venture (Package C1)",
    "category": "rail",
    "authority": "NHSRCL",
    "registrationNo": null,
    "description": "Underground Mumbai terminal station of the Mumbai-Ahmedabad high-speed rail corridor, with six platforms about 32 m below ground on a 4.8 hectare site in BKC. Foundation works were almost complete and base slab work had started as of March 2026.",
    "address": "Bandra Kurla Complex, Mumbai (G Block / Kanzul Iman Road per OpenStreetMap reverse geocode)",
    "latitude": 19.067725,
    "longitude": 72.864846,
    "coordinateSource": "OpenStreetMap way 626938775 ('Mumbai BKC'), fetched through the Overpass API on 2026-10-10; centre point of the polygon tagged railway=construction, construction=train_station. Wikipedia lists 19.0682, 72.8659 for the station, about 120 m away",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "March 2028 for the station (Wikipedia, 54-month contract from September 2023); line opening listed as 2029",
    "status": "Under construction: foundation almost complete, base slab taken up (Railway Minister's update reported by The Week, 2026-03-26)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.theweek.in/news/biz-tech/2026/03/26/mumbai-ahmedabad-bullet-train-progress.html",
      "https://en.wikipedia.org/wiki/Bandra_Kurla_Complex_high-speed_railway_station"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "An NHSRCL press-release URL found in search returned 404, so no NHSRCL page was opened; facts come from The Week and Wikipedia. Depth, platform count, site area, contractor and completion date are from Wikipedia."
  },
  {
    "code": "HE-02",
    "name": "Mumbai Metro Line 2B (Yellow Line) - ILFS station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Elevated station on Metro Line 2B, the 23.6 km DN Nagar-Mandale corridor. Six stations at the Mandale-Chembur end are open (five since April 2026, Chembur since 2026-08-13); the stretch through Kurla, BKC and Bandra is still being built.",
    "address": "Bandra Kurla Complex Road, G Block, Bandra Kurla Complex",
    "latitude": 19.063642,
    "longitude": 72.860038,
    "coordinateSource": "OpenStreetMap node 5219622663 ('IL&FS'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, construction=station",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "December 2027 (Wikipedia Yellow Line station table)",
    "status": "Under construction; not among the six Line 2B stations open as of 2026-08-13",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://en.wikipedia.org/wiki/Yellow_Line_(Mumbai_Metro)",
      "https://www.freepressjournal.in/mumbai/mumbai-connectivity-boost-sclr-phase-ii-opens-chembur-metro-station-starts-services-tbm-arjuna-launched"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Under-construction status of this specific station is from the Wikipedia station table (opened 2026-10-10); the Free Press Journal report of 2026-08-13 confirms only six stations are open and gives no date for the rest. OpenStreetMap names the node 'IL&FS'."
  },
  {
    "code": "HE-03",
    "name": "Mumbai Metro Line 2B (Yellow Line) - MTNL station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Elevated station on Metro Line 2B, the 23.6 km DN Nagar-Mandale corridor. Six stations at the Mandale-Chembur end are open (five since April 2026, Chembur since 2026-08-13); the stretch through Kurla, BKC and Bandra is still being built.",
    "address": "Bandra Kurla Complex Road, G Block, Bandra Kurla Complex",
    "latitude": 19.070486,
    "longitude": 72.870629,
    "coordinateSource": "OpenStreetMap node 5219622658 ('MTNL'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, construction=station",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "December 2027 (Wikipedia Yellow Line station table)",
    "status": "Under construction; not among the six Line 2B stations open as of 2026-08-13",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://en.wikipedia.org/wiki/Yellow_Line_(Mumbai_Metro)",
      "https://www.freepressjournal.in/mumbai/mumbai-connectivity-boost-sclr-phase-ii-opens-chembur-metro-station-starts-services-tbm-arjuna-launched"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Under-construction status of this specific station is from the Wikipedia station table; the press source is line-level. The point is close to the H/East-L boundary at the Mithi River; both ward checks return H/E."
  },
  {
    "code": "HE-04",
    "name": "BKC Pod Taxi (Automated Rapid Transit System), Kurla-BKC-Bandra",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA), on a public-private partnership basis",
    "category": "other",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "8.85 km elevated automated rapid transit (pod taxi) corridor linking Kurla, Bandra Kurla Complex and Bandra, planned with 22 stations. Phase 1 covers 3.36 km between Kurla and Bandra with eight stations; more than 100 piles had been completed by early September 2026.",
    "address": "Bandra Kurla Complex, Mumbai (corridor between Kurla and Bandra; the piling locations are not published in the source)",
    "latitude": 19.067115,
    "longitude": 72.865725,
    "coordinateSource": "OpenStreetMap node 1640262758 ('Bandra Kurla Complex'), fetched through the Overpass API on 2026-10-10 via Nominatim; this is the place node for the BKC suburb, not a construction site",
    "coordinatePrecision": "locality",
    "ward": "H/E",
    "proposedCompletion": null,
    "status": "Under construction: over 100 piles completed (Free Press Journal, 2026-09-06)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-pod-taxi-project-crosses-100-piling-mark-elevated-corridor-to-connect-kurla-bandra-and-bkc"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "Coordinate is locality level only. The article does not say where piling is taking place, name the concessionaire or give a completion date, so those are left out. Not suitable for a precise sensor pin without a site location."
  },
  {
    "code": "HE-05",
    "name": "EVANA BY GEECEE",
    "developer": "GeeCee Ventures Limited",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "P51800080512",
    "description": "Residential (group housing) project by GeeCee Ventures on CTS 601 (part), Survey 341 (part), Bandra East. Floor and unit counts are not printed on the certificate.",
    "address": "CTS No 601 (part), Survey No 341 (part), Bandra, Andheri, Mumbai Suburban 400051",
    "latitude": 19.0595,
    "longitude": 72.842761,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "2029-06-30",
    "status": "MahaRERA registration valid from 2025-06-12 to 2029-06-30",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=P51800080512&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=56929&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "HE-06",
    "name": "DLH Business Bay",
    "developer": "DLH STELMAC DEVELOPERS PRIVATE LIMITED",
    "category": "commercial",
    "authority": "MahaRERA",
    "registrationNo": "PC1180002501679",
    "description": "Sale Wing B of a composite building on Aliyawar Jung Marg, Bandra East: 13 sanctioned habitable floors and 129 units, project built-up area 13,674.19 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to the 12th slab.",
    "address": "C.T.S. No. 418A(pt), 418/541(pt), 418/545-548 and others of Village Bandra, Aliyawar Jung Marg, Bandra (East), Mumbai 400051",
    "latitude": 19.06449,
    "longitude": 72.846181,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "2027-12-31",
    "status": "MahaRERA registration valid from 2025-12-03 to 2027-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PC1180002501679&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=59800&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "HE-07",
    "name": "Trinity Towers",
    "developer": "Jet Speed Realtors Private Limited",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "PR1180002500480",
    "description": "Three-wing residential project in Santacruz East (Wing A 11 floors/44 units, Wing B 10 floors/38 units, Wing C 10 floors/58 units), project built-up area 10,720.30 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to top of basement.",
    "address": "Plot 33, Bandra, Andheri, Mumbai Suburban 400055",
    "latitude": 19.079375,
    "longitude": 72.844829,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "H/E",
    "proposedCompletion": "2029-03-31",
    "status": "MahaRERA registration valid from 2025-08-05 to 2029-03-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PR1180002500480&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=57983&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "L-01",
    "name": "Mumbai Metro Line 2B (Yellow Line) - SG Barve Marg station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Elevated station on Metro Line 2B, the 23.6 km DN Nagar-Mandale corridor. Six stations at the Mandale-Chembur end are open (five since April 2026, Chembur since 2026-08-13); the stretch through Kurla, BKC and Bandra is still being built.",
    "address": "Lal Bahadur Shastri Marg, Kismat Nagar, Kurla West",
    "latitude": 19.075804,
    "longitude": 72.877407,
    "coordinateSource": "OpenStreetMap node 5219622644 ('SG Barve Marg'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, construction=station",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "December 2027 (Wikipedia Yellow Line station table)",
    "status": "Under construction; not among the six Line 2B stations open as of 2026-08-13",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://en.wikipedia.org/wiki/Yellow_Line_(Mumbai_Metro)",
      "https://www.freepressjournal.in/mumbai/mumbai-connectivity-boost-sclr-phase-ii-opens-chembur-metro-station-starts-services-tbm-arjuna-launched"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Under-construction status of this specific station is from the Wikipedia station table; the press source is line-level."
  },
  {
    "code": "L-02",
    "name": "Mumbai Metro Line 2B (Yellow Line) - Kurla (East) station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Elevated station on Metro Line 2B, the 23.6 km DN Nagar-Mandale corridor. Six stations at the Mandale-Chembur end are open (five since April 2026, Chembur since 2026-08-13); the stretch through Kurla, BKC and Bandra is still being built.",
    "address": "Mother Dairy Road, Nehru Nagar, Kurla East",
    "latitude": 19.062995,
    "longitude": 72.884714,
    "coordinateSource": "OpenStreetMap node 5219622419 ('Kurla'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, construction=station",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "December 2027 (Wikipedia Yellow Line station table)",
    "status": "Under construction; not among the six Line 2B stations open as of 2026-08-13",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://en.wikipedia.org/wiki/Yellow_Line_(Mumbai_Metro)",
      "https://www.freepressjournal.in/mumbai/mumbai-connectivity-boost-sclr-phase-ii-opens-chembur-metro-station-starts-services-tbm-arjuna-launched"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Official name is Kurla (East) per the Wikipedia station table; the OpenStreetMap node is named 'Kurla'. OpenStreetMap also maps a 'Kurla Terminal' node that is not in the current official station list and was not used."
  },
  {
    "code": "L-03",
    "name": "NAHAR'S CHANDI VALLEY - PHASE I",
    "developer": "NAHAR BUILDERS LIMITED",
    "category": "mixed_use",
    "authority": "MahaRERA",
    "registrationNo": "PM1180002500059",
    "description": "Phase I of Nahar's Chandi Valley at Chandivali: three towers in six wings of 14 sanctioned habitable floors each, 308 units in total, project built-up area 47,564.35 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to plinth.",
    "address": "Plot 30A/1/11/C, 31, 31/1, 32, 33, 36A/G, Chandivali, Kurla, Mumbai Suburban 400072",
    "latitude": 19.110775,
    "longitude": 72.899637,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "2030-12-31",
    "status": "MahaRERA registration valid from 2025-05-26 to 2030-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PM1180002500059&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=55429&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "L-04",
    "name": "CRESCENT WTC T2 PHASE II",
    "developer": "Crown Realty Developers Private Limited",
    "category": "commercial",
    "authority": "MahaRERA",
    "registrationNo": "PC1180002500950",
    "description": "Commercial building at Mohili, Sakinaka: 6 sanctioned habitable floors and 66 units, project built-up area 3,904.91 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to plinth.",
    "address": "Plot 802-B, 803-B, 817-B and 817-A, Mohili, Kurla, Mumbai Suburban 400072",
    "latitude": 19.099232,
    "longitude": 72.881301,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "2028-08-31",
    "status": "MahaRERA registration valid from 2025-09-25 to 2028-08-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PC1180002500950&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=57647&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "L-05",
    "name": "ELEVATE 9",
    "developer": "MERU REALTY LLP",
    "category": "mixed_use",
    "authority": "MahaRERA",
    "registrationNo": "PM1180002600606",
    "description": "Single building in Kurla West with 14 sanctioned habitable floors and 70 units, project built-up area 2,971.49 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to plinth level.",
    "address": "CTS No. 127 and 128, 128/1 to 24, Kurla, Mumbai Suburban 400070",
    "latitude": 19.069203,
    "longitude": 72.876132,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "2031-03-31",
    "status": "MahaRERA registration valid from 2026-06-01 to 2031-03-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PM1180002600606&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=64157&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "L-06",
    "name": "152 Samruddhi",
    "developer": "Aditya Samruddhi Enterprises",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "PR1180002501410",
    "description": "Two-wing (A and B) project on CTS 6 (pt), Kurla East. The certificate annexure prints 0 for floors, units and built-up area, so scale is not published there; commencement certificate issued up to top of plinth.",
    "address": "CTS No. 6 (pt), Kurla, Mumbai Suburban 400024",
    "latitude": 19.064361,
    "longitude": 72.882679,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "L",
    "proposedCompletion": "2029-12-31",
    "status": "MahaRERA registration valid from 2025-11-07 to 2029-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PR1180002501410&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=58566&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "S-01",
    "name": "Mumbai Metro Line 6 (Pink Line) - Powai Lake station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Station on Mumbai Metro Line 6 (Pink Line), a 15.31 km corridor with 13 stations from Swami Samarth Nagar to Vikhroli (EEH) that follows the Jogeshwari-Vikhroli Link Road through Andheri East and Powai.",
    "address": "Jogeshwari-Vikhroli Link Road (Adi Shankaracharya Marg), Powai",
    "latitude": 19.120008,
    "longitude": 72.905969,
    "coordinateSource": "OpenStreetMap node 5219519239 ('Powai Lake Station'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, a stop position on the Line 6 alignment under construction",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2026 H2 (MMRDA target as reported by Swarajya on 2026-01-21); the Wikipedia Pink Line article lists December 2028",
    "status": "Under construction; line not yet open to passengers (Free Press Journal, 2026-09-01)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-metro-line-6-may-begin-services-without-full-depot-as-mmrda-plans-temporary-maintenance-facility-at-vikhroli",
      "https://en.wikipedia.org/wiki/Pink_Line_(Mumbai_Metro)",
      "https://swarajyamag.com/amp/story/news-brief/mmrda-clears-way-for-mumbai-metro-line-6-opening-in-second-half-of-2026-without-kanjurmarg-car-depot"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Station name is from the Wikipedia Pink Line station table. Status is line-level."
  },
  {
    "code": "S-02",
    "name": "Mumbai Metro Line 4 (Green Line) - Bhandup Mahapalika station",
    "developer": "Mumbai Metropolitan Region Development Authority (MMRDA)",
    "category": "metro",
    "authority": "MMRDA",
    "registrationNo": null,
    "description": "Station on Metro Line 4 (Wadala-Kasarvadavali corridor) on LBS Marg in Bhandup. No part of Line 4 had opened as of late August 2026; the first stretch planned to open is the 10.5 km Gaimukh-Cadbury Junction section in Thane.",
    "address": "Lal Bahadur Shastri Marg, Bhandup",
    "latitude": 19.138742,
    "longitude": 72.930774,
    "coordinateSource": "OpenStreetMap node 5225899378 ('Bhandup Mahapalika Station'), fetched through the Overpass API on 2026-10-10; tagged railway=construction, a stop position on the Line 4 alignment under construction",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "December 2026 for the Cadbury Junction-Gandhi Nagar segment (Wikipedia Green Line planning table); the station table lists 2027",
    "status": "Under construction; no section of Line 4 open yet (Free Press Journal, 2026-08-23)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.freepressjournal.in/mumbai/mumbai-infra-update-metro-4-pit-line-clears-cmrs-inspection-mmrda-awaits-safety-report-ahead-of-diwali-launch",
      "https://en.wikipedia.org/wiki/Green_Line_(Mumbai_Metro)"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No street address is published; the road and locality are from OpenStreetMap. Station name and segment are from Wikipedia. The press source says work on the remaining sections continues but does not name this station. Given that the first Thane stretch had not opened, the December 2026 segment target looks unlikely to hold."
  },
  {
    "code": "S-03",
    "name": "Bhandup East-West flyover (railway overbridge near Bhandup station)",
    "developer": "Brihanmumbai Municipal Corporation (BMC)",
    "category": "bridge",
    "authority": "BMC",
    "registrationNo": null,
    "description": "530 m flyover near Bhandup railway station giving a direct road link between Bhandup East and Bhandup West. Work order issued October 2023, construction began in 2024, and about 30 percent was complete in March 2026.",
    "address": "Near Bhandup railway station, Bhandup, Mumbai (Jai Hind Mill Compound, Bhandup West per OpenStreetMap reverse geocode)",
    "latitude": 19.142335,
    "longitude": 72.935878,
    "coordinateSource": "OpenStreetMap way 1490615562 ('Bhandup Railway Overbridge'), fetched through the Overpass API on 2026-10-10; centre point of the way tagged highway=construction",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2027-01-31",
    "status": "Under construction: about 30 percent complete, design under IIT Bombay review (Swarajya, 2026-03-07)",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://swarajyamag.com/amp/story/news-brief/bmc-ropes-in-iit-bombay-to-vet-bhandup-flyovers-sharp-curve-design-completion-targeted-by-january-2027"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "Latest source is seven months old; at 30 percent complete in March 2026 with a January 2027 target, completion before October 2026 is not plausible. Cost and contractor are not in the source."
  },
  {
    "code": "S-04",
    "name": "Goregaon-Mulund Link Road (GMLR) - Mulund-side flyover, Tansa pipeline to Nahur railway bridge",
    "developer": "Brihanmumbai Municipal Corporation (BMC)",
    "category": "road",
    "authority": "BMC",
    "registrationNo": null,
    "description": "About 1.89 km flyover on the eastern end of the 12.2 km Goregaon-Mulund Link Road, running from the Tansa pipeline to the Nahur railway bridge with a cable-stayed span at Dr Hedgewar Chowk. In February 2026, 39 of 48 piers and 10 of 47 spans were complete.",
    "address": "Goregaon-Mulund Link Road, Sonapur / Nahur, between the Tansa pipeline and the Nahur railway bridge",
    "latitude": 19.162316,
    "longitude": 72.939692,
    "coordinateSource": "OpenStreetMap way 1125684382 ('GMLR Flyover'), fetched through the Overpass API on 2026-10-10; centre point of one mapped segment tagged highway=construction, bridge=yes",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2027-06-15 for all Mulund-side work (BMC direction reported 2026-02-05); whole GMLR corridor expected 2028",
    "status": "Under construction as of February-March 2026; part of the Mulund-side structure was targeted to open by 2026-05-31 and that was not verified",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://navbharatlive.com/maharashtra/mumbai/gmlr-mulund-flyover-construction-progress-mumbai-east-west-link-1551480.html",
      "https://swarajyamag.com/amp/story/news-brief/goregaonmulund-link-road-completion-pushed-to-2028-as-bmc-grapples-with-tunnel-and-flyover-delays-report"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "Confidence is medium because the latest opened sources are from February and March 2026 and a smaller northern arm was due to open by 31 May 2026. The coordinate is one segment of a 1.89 km linear structure. The Goregaon-side Dindoshi-Film City flyover is outside the pilot wards."
  },
  {
    "code": "S-05",
    "name": "Krantiveer Mahatma Jyotiba Phule Hospital redevelopment, Vikhroli",
    "developer": "Brihanmumbai Municipal Corporation (BMC)",
    "category": "public_building",
    "authority": "BMC",
    "registrationNo": null,
    "description": "Redevelopment of the municipal hospital at Kannamwar Nagar into a 13-storey, 500-bed super-speciality hospital of about 37,789 sq m with a separate 21-floor staff quarters building, at an estimated cost of Rs 593 crore. The BMC work order was issued on 2024-07-08.",
    "address": "Krantiveer Mahatma Jyotiba Phule Hospital, Kannamwar Nagar, Vikhroli East, Mumbai",
    "latitude": 19.118004,
    "longitude": 72.939475,
    "coordinateSource": "OpenStreetMap node 7225067275 ('Krantiveer Mahatma Jyotiba Phule Hospital, Vikhroli'), fetched through the Overpass API on 2026-10-10 via Nominatim; amenity=hospital node at the hospital site on Bhakti Marg, Kannamwar Nagar II",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2027 (about three years from the July 2024 work order, per Biltrax Media; no firm date published)",
    "status": "Under construction: only excavation and plinth work done by September 2025; listed by BMC in February 2026 among hospitals where capacity is being created",
    "statusConfidence": "high",
    "sourceUrls": [
      "https://www.biltraxmedia.com//?p=56915",
      "https://navbharatlive.com/maharashtra/mumbai/construction-of-500-bed-hospital-in-vikhroli-is-slow-not-even-one-floor-is-completed-in-1-year-people-are-angry-1354384.html",
      "https://www.freepressjournal.in/amp/mumbai/bmc-2026-budget-allocates-7456-crore-for-health-4556-new-beds-super-speciality-care-advanced-mri-machines"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "No progress figure for 2026 was found. A 13-storey building at plinth stage in September 2025 cannot have been completed by October 2026, hence high confidence that it is still under construction. Contractor name is not in the sources."
  },
  {
    "code": "S-06",
    "name": "Rockside",
    "developer": "HGP Community Pvt. Ltd.",
    "category": "residential",
    "authority": "MahaRERA",
    "registrationNo": "PR1180002502729",
    "description": "Two-wing residential project by HGP Community Pvt. Ltd. at Powai (the coordinate reverse-geocodes to Hiranandani Gardens): Wings A and B with 13 sanctioned habitable floors and 26 units each, project built-up area 11,105.72 (area figure as printed on the certificate, which prints no unit). Commencement certificate issued up to top of stilt slab.",
    "address": "Plot No. 22, C.T.S. No. 22/A/B/3 and 22/A/B/4 (pt), Powai, Kurla, Mumbai Suburban 400076",
    "latitude": 19.116197,
    "longitude": 72.91215,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2030-09-30",
    "status": "MahaRERA registration valid from 2026-03-12 to 2030-09-30",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PR1180002502729&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=63090&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  },
  {
    "code": "S-07",
    "name": "Cons 1221 MIG T/S and 100 Shops S. No. 113 (pt), CTS 356/A (pt) Pocket II Kannamwar Nagar Mumbai",
    "developer": "Mumbai Housing And Area Development Board",
    "category": "mixed_use",
    "authority": "MahaRERA",
    "registrationNo": "PM1181012503046",
    "description": "MHADA (Mumbai Housing and Area Development Board) housing project at Pocket II, Kannamwar Nagar, Vikhroli East: 1,221 MIG tenements and 100 shops in buildings of 32 to 33 sanctioned habitable floors, project built-up area 133,173.53 (area figure as printed on the certificate, which prints no unit).",
    "address": "S. No. 113 (pt), CTS No. 356/A (pt) (Govt. land), village Hariyali, Pocket II Kannamwar Nagar, Kurla, Mumbai Suburban 400083",
    "latitude": 19.117958,
    "longitude": 72.940765,
    "coordinateSource": "Coordinates published by MahaRERA for this registration (map link on the public project search result), cross-checked by OpenStreetMap reverse geocode to the expected locality and pincode area",
    "coordinatePrecision": "site",
    "ward": "S",
    "proposedCompletion": "2032-12-31",
    "status": "MahaRERA registration valid from 2026-03-25 to 2032-12-31",
    "statusConfidence": "medium",
    "sourceUrls": [
      "https://www.maharera.maharashtra.gov.in/projects-search-result?project_name=PM1181012503046&project_location=&project_completion_date=&project_state=27&project_district=Array&carpetAreas=&completionPercentages=&project_division=&page=1&op=Search",
      "https://www.maharera.maharashtra.gov.in/project-document?id=63773&type=DocProjectCert"
    ],
    "verifiedOn": "2026-10-10",
    "notes": "The position is the one the promoter declared on MahaRERA. Listed because the registration is current; work on site was not independently confirmed."
  }
];

export const DUST_AUTHORITY = {
  "summary": "BMC's air pollution mitigation guidelines put site-level enforcement with the ward. Each ward's Assistant Commissioner deploys enforcement squads that inspect construction sites and can issue a stop-work notice or seal a site. BMC's Environment and Climate Change Department issues the guidelines. The Maharashtra Pollution Control Board (MPCB) is the state regulator for air pollution.",
  "requirements": [
    "Metal sheet barricade at least 35 feet high around projects taller than 70 m or layouts over 1 acre, and at least 25 feet for sites under 1 acre.",
    "Buildings under construction enclosed with green cloth, jute sheet or tarpaulin on all sides.",
    "Water sprinkling on debris and loose earth, and water fogging during loading and unloading.",
    "Vehicles carrying construction material fully covered from the top and all sides, with tyre washing at every exit.",
    "Grinding, cutting, drilling and sawing done in an enclosed area with continuous water sprinkling.",
    "Loose soil, sand and debris stored in a barricaded area, fully covered with tarpaulin.",
    "A sensor-based PM2.5 and PM10 monitor at the site, with readings available to BMC."
  ],
  "channels": [
    {
      "key": "marg-portal",
      "name": "BMC MARG grievance portal",
      "detail": "online complaint with a mobile number and OTP; gives a grievance ID you can look up later",
      "url": "https://marg.mcgm.gov.in/MARG/welcomePage.html",
      "phone": null
    },
    {
      "key": "mybmc-app",
      "name": "MyBMC MARG app (Android)",
      "detail": "BMC's grievance app with photo upload and status tracking",
      "url": "https://play.google.com/store/apps/details?id=com.esri.ugms_bmc",
      "phone": null
    },
    {
      "key": "helpline-1916",
      "name": "BMC helpline 1916",
      "detail": "central 24x7 helpline for civic complaints",
      "url": "https://www.mcgm.gov.in/irj/portal/anonymous",
      "phone": "1916"
    },
    {
      "key": "mumbai-air-app",
      "name": "Mumbai Air app (Android)",
      "detail": "BMC's app for air pollution complaints; its store listing was last updated in October 2024",
      "url": "https://play.google.com/store/apps/details?id=com.abelsoft.mumbai_air",
      "phone": null
    },
    {
      "key": "ward-office",
      "name": "Ward office or ward control room",
      "detail": "in writing at the ward office, or by phone to the control room listed for the ward",
      "url": "https://portal.mcgm.gov.in/irj/portal/anonymous/BMC-on-Map-Wards-Offices",
      "phone": null
    },
    {
      "key": "mpcb-sro",
      "name": "MPCB sub-regional office",
      "detail": "Mumbai-II for H/East and L (sromumbai2@mpcb.gov.in), Mumbai-III for K/East and S (sromumbai3@mpcb.gov.in)",
      "url": "https://www.mpcb.gov.in/en/node/478",
      "phone": null
    }
  ],
  "sourceUrls": [
    "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Environment/Docs/28%20Points%20Guidelines%20for%20Air%20Pollution%20Mitigation1.pdf",
    "https://portal.mcgm.gov.in/irj/go/km/docs/documents/Environment/Resources/Guidelines%20for%20Air%20Pollution%20Mitigation%20%20-%20MGC-F-1102%20DTD.25.10.2023.pdf",
    "https://portal.mcgm.gov.in/irj/go/km/docs/documents/MCGM%20Department%20List/Environment/Docs/Mandatory%20Installation%20of%20Sensor-Based%20Air%20Quality%20Monitors%20and%20LED.pdf",
    "https://www.mcgm.gov.in/irj/portal/anonymous/qlenvironment"
  ],
  "verifiedOn": "2026-10-10"
};
