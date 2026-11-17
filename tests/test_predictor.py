import unittest

from ml.odisha_predictor import predict_odisha_crops
from ml.predictor import map_form_to_model_input


class TestPredictors(unittest.TestCase):
    def test_generic_feature_schema_is_named_and_numeric(self):
        features = map_form_to_model_input({"nitrogen_value": 50, "phosphorus_value": 30, "potassium_value": 20, "temp": 27, "humidity": 70, "ph": 6.2, "rainfall": 850})
        self.assertEqual(list(features.columns), ["N", "P", "K", "temperature", "humidity", "ph", "rainfall"])
        self.assertEqual(features.shape, (1, 7))

    def test_odisha_model_uses_detected_district_sample(self):
        result = predict_odisha_crops({"district_key": "anugul", "season": "kharif"})
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["predictions"])
        self.assertIn("expected_yield_tonnes_per_ha", result["predictions"][0])
        self.assertGreaterEqual(result["predictions"][0]["source_records"], 1)

    def test_odisha_model_requires_district(self):
        self.assertEqual(predict_odisha_crops({"season": "kharif"})["status"], "unavailable")


if __name__ == "__main__":
    unittest.main()
