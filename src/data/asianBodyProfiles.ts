export const asianBodyProfiles = {
  "measurement_categories": {
    "male": {
      "petite": {
        "label": "Petite / Mungil",
        "height_cm": { "min": 0, "max": 164 },
        "weight_kg": { "min": 50, "max": 60 }
      },
      "average": {
        "label": "Average / Rata-rata",
        "height_cm": { "min": 165, "max": 174 },
        "weight_kg": { "min": 60, "max": 72 }
      },
      "tall": {
        "label": "Tall / Tinggi",
        "height_cm": { "min": 175, "max": 182 },
        "weight_kg": { "min": 70, "max": 85 }
      },
      "very_tall": {
        "label": "Very Tall / Ekstra",
        "height_cm": { "min": 183, "max": 250 },
        "weight_kg": { "min": 80, "max": 150 }
      }
    },
    "female": {
      "petite": {
        "label": "Petite / Mungil",
        "height_cm": { "min": 0, "max": 154 },
        "weight_kg": { "min": 40, "max": 48 }
      },
      "average": {
        "label": "Average / Rata-rata",
        "height_cm": { "min": 155, "max": 163 },
        "weight_kg": { "min": 48, "max": 58 }
      },
      "tall": {
        "label": "Tall / Tinggi",
        "height_cm": { "min": 164, "max": 172 },
        "weight_kg": { "min": 55, "max": 65 }
      },
      "very_tall": {
        "label": "Very Tall / Ekstra",
        "height_cm": { "min": 173, "max": 250 },
        "weight_kg": { "min": 60, "max": 130 }
      }
    }
  },
  "body_classifications": {
    "ectomorph": {
      "type": "Ectomorph",
      "alias": "Ramping / Slender",
      "description": "Persentase lemak tubuh dan massa otot rendah, tulang kecil, bahu sempit. Sulit menaikkan berat badan."
    },
    "mesomorph": {
      "type": "Mesomorph",
      "alias": "Atletis / Fit",
      "description": "Proporsi ideal, mudah membentuk otot. Pada pria, bahu tegap (V-shape). Pada wanita, tubuh terlihat kencang (toned)."
    },
    "endomorph": {
      "type": "Endomorph",
      "alias": "Berisi / Stocky",
      "description": "Massa otot dan lemak lebih padat, tulang besar. Mudah menaikkan berat badan, bentuk tubuh cenderung lebih bulat atau gempal."
    },
    "skinny_fat": {
      "type": "Skinny-Fat",
      "alias": "Skinny-Fat",
      "description": "Terlihat kurus saat berpakaian, namun memiliki persentase lemak perut/tubuh yang cukup tinggi dengan otot yang minim."
    }
  },
  "geometric_silhouettes": {
    "hourglass": {
      "name": "Jam Pasir / Hourglass",
      "applicable_for": "Universal",
      "description": "Lingkar dada dan pinggul seimbang dengan pinggang yang kecil dan terdefinisi."
    },
    "pear": {
      "name": "Buah Pir / Triangle / Pear",
      "applicable_for": "Universal",
      "description": "Pinggul, pantat, dan paha lebih lebar dibandingkan dada dan bahu."
    },
    "apple": {
      "name": "Apel / Inverted Triangle / Apple",
      "applicable_for": "Universal",
      "description": "Bahu atau dada lebih lebar, dengan pinggul dan kaki yang lebih kecil."
    },
    "rectangle": {
      "name": "Persegi Panjang / Rectangle / Straight",
      "applicable_for": "Universal",
      "description": "Ukuran dada, pinggang, dan pinggul nyaris sama rata. Postur lurus tanpa lekukan tajam."
    }
  },
  "ready_templates": [
    {
      "template_id": "template_a",
      "template_name": "K-Pop Idol / Model Look",
      "target_gender": "Universal",
      "specifications": {
        "male": {
          "height_cm": 178,
          "weight_kg": 65
        },
        "female": {
          "height_cm": 165,
          "weight_kg": 48
        }
      },
      "body_classification_default": "ectomorph",
      "geometric_silhouette_default": "rectangle",
      "physical_traits": ["Kaki jenjang", "Bahu lurus", "Postur ramping", "Proporsional"]
    },
    {
      "template_id": "template_b",
      "template_name": "Tipe Pekerja Keras / Atletis Standar",
      "target_gender": "Male",
      "specifications": {
        "male": {
          "height_cm": 172,
          "weight_kg": 70
        }
      },
      "body_classification_default": "mesomorph",
      "geometric_silhouette_default": "apple",
      "physical_traits": ["Otot lengan terdefinisi", "Otot dada terdefinisi", "Tidak terlalu tinggi", "Padat"]
    },
    {
      "template_id": "template_c",
      "template_name": "Wanita Berisi (Curvy / Soft Feature)",
      "target_gender": "Female",
      "specifications": {
        "female": {
          "height_cm": 158,
          "weight_kg": 60
        }
      },
      "body_classification_default": "endomorph",
      "geometric_silhouette_default": "pear",
      "physical_traits": ["Fitur wajah bulat", "Pinggul berisi", "Paha berisi", "Bahu tidak terlalu lebar"]
    },
    {
      "template_id": "template_d",
      "template_name": "Pria Gempal (Stocky / Brawny)",
      "target_gender": "Male",
      "specifications": {
        "male": {
          "height_cm": 168,
          "weight_kg": 85
        }
      },
      "body_classification_default": "endomorph",
      "geometric_silhouette_default": "apple",
      "physical_traits": ["Bahu lebar", "Leher tebal", "Tulang besar", "Fisik terlihat sangat kuat", "Kokoh"]
    },
    {
      "template_id": "template_e",
      "template_name": "Mungil & Ceria (Petite Cute)",
      "target_gender": "Female",
      "specifications": {
        "female": {
          "height_cm": 150,
          "weight_kg": 42
        }
      },
      "body_classification_default": "ectomorph",
      "geometric_silhouette_default": "rectangle",
      "physical_traits": ["Tulang sangat kecil", "Perawakan mungil dari atas hingga bawah"]
    },
    {
      "template_id": "template_f",
      "template_name": "Pria Atletis Kasual (Fit Casual / Muscular Core)",
      "target_gender": "Male",
      "specifications": {
        "male": {
          "height_cm": 173,
          "weight_kg": 74
        }
      },
      "body_classification_default": "mesomorph",
      "geometric_silhouette_default": "apple",
      "physical_traits": ["Otot lengan solid", "Bahu bidang", "Dada tegap", "Massa otot dan tulang padat", "Betis atletis"]
    }
  ]
};
