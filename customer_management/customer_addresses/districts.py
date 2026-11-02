"""Legacy district -> current districts, for states whose districts were
reorganised after India Post's PIN directory was last updated.

India Post still files a PIN under the district it belonged to when the
directory was compiled (e.g. 506344 Govindaraopet is listed under
"Warangal", though it has been in Mulugu district since 2019). An address
naming any *successor* of that legacy district is therefore accepted as a
district match — the PIN's own post offices/mandal then pin down the
actual location (see pincode.verify_address).

Sources: Telangana's 2016 reorganisation (10 -> 31 districts, Telangana
Districts (Formation) Act G.O.s of 11 Oct 2016) plus Mulugu and Narayanpet
(Feb 2019); Andhra Pradesh's 2022 reorganisation (13 -> 26 districts,
G.O.s of 3 Apr 2022). A successor list includes every new district that
took territory from the legacy one, so a PIN on a boundary is never
rejected for naming the district it actually moved to.

Keys and values are display names; pincode.py normalizes both (spacing,
punctuation, "District", alias spellings) before comparing. To support
another state, add a block here — nothing else needs to change.
"""

LEGACY_DISTRICT_SUCCESSORS = {
    "Telangana": {
        "Adilabad": ["Adilabad", "Komaram Bheem Asifabad", "Mancherial", "Nirmal"],
        "Karimnagar": [
            "Karimnagar", "Jagtial", "Peddapalli", "Rajanna Sircilla",
            "Jayashankar Bhupalpally", "Siddipet", "Hanumakonda",
        ],
        "Nizamabad": ["Nizamabad", "Kamareddy"],
        "Medak": ["Medak", "Sangareddy", "Siddipet", "Kamareddy"],
        "Warangal": [
            "Warangal", "Hanumakonda", "Jayashankar Bhupalpally", "Mulugu",
            "Mahabubabad", "Jangaon", "Siddipet",
        ],
        "Khammam": ["Khammam", "Bhadradri Kothagudem", "Mahabubabad", "Mulugu"],
        "Nalgonda": ["Nalgonda", "Suryapet", "Yadadri Bhuvanagiri", "Jangaon"],
        "Mahabubnagar": [
            "Mahabubnagar", "Nagarkurnool", "Wanaparthy", "Jogulamba Gadwal",
            "Narayanpet", "Rangareddy", "Vikarabad",
        ],
        "Rangareddy": ["Rangareddy", "Medchal-Malkajgiri", "Vikarabad"],
        # India Post's "Hyderabad" is the city's postal area, which also
        # covers suburbs administratively in Medchal-Malkajgiri/Rangareddy.
        "Hyderabad": ["Hyderabad", "Medchal-Malkajgiri", "Rangareddy"],
        # Jayashankar Bhupalpally (2016) was itself split to form Mulugu (2019).
        "Jayashankar Bhupalpally": ["Jayashankar Bhupalpally", "Mulugu"],
        "Mahabubabad": ["Mahabubabad"],
    },
    "Andhra Pradesh": {
        "Srikakulam": ["Srikakulam", "Parvathipuram Manyam"],
        "Vizianagaram": ["Vizianagaram", "Parvathipuram Manyam", "Visakhapatnam"],
        "Visakhapatnam": ["Visakhapatnam", "Anakapalli", "Alluri Sitharama Raju"],
        "East Godavari": ["East Godavari", "Kakinada", "Konaseema", "Alluri Sitharama Raju"],
        "West Godavari": ["West Godavari", "Eluru"],
        "Krishna": ["Krishna", "NTR", "Eluru"],
        "Guntur": ["Guntur", "Palnadu", "Bapatla"],
        "Prakasam": ["Prakasam", "Bapatla", "Nellore"],
        "Nellore": ["Nellore", "Tirupati"],
        "Chittoor": ["Chittoor", "Tirupati", "Annamayya"],
        "Kadapa": ["Kadapa", "Annamayya"],
        "Anantapur": ["Anantapur", "Sri Sathya Sai"],
        "Kurnool": ["Kurnool", "Nandyal"],
    },
}
