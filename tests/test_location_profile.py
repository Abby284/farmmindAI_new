import unittest
from unittest.mock import patch

from services.location_profile import get_location_profile


class TestLocationProfile(unittest.TestCase):
    @patch("services.location_profile._imd_district_rainfall", return_value={})
    @patch("services.location_profile._district_seasonal_rainfall", return_value={"rainfall": 700, "sample_count": 5, "source": "test rainfall"})
    @patch("services.location_profile._weather_snapshot", return_value={"temp": 28, "humidity": 75, "forecast_rainfall": 15})
    @patch("services.location_profile._reverse_geocode", return_value={"district": "Angul", "district_key": "anugul", "state": "Odisha", "label": "Angul"})
    def test_odisha_profile_has_safe_location_values(self, *_mocks):
        profile = get_location_profile(20.84, 85.10)
        self.assertEqual(profile["location"]["district_key"], "anugul")
        self.assertEqual(profile["values"]["rainfall"], 700)
        self.assertEqual(profile["values"]["temp"], 28)

    def test_non_odisha_coordinate_is_rejected(self):
        with self.assertRaises(ValueError):
            get_location_profile(28.61, 77.20)


if __name__ == "__main__":
    unittest.main()
