import unittest

from engine import CROPS, analyze, calc_profit, compute_risk, score_crop


FIELD = {"soil": "loamy", "season": "kharif", "rainfall": 850, "temp": 28, "ph": 6.3, "nitrogen": "medium", "water": "partial", "farm_size": 2, "goal": "profit"}


class TestEngine(unittest.TestCase):
    def test_score_and_risk_use_crop_definition(self):
        crop = next(crop for crop in CROPS if crop["id"] == "maize")
        score, details = score_crop(crop, FIELD)
        risk, flags = compute_risk(crop, FIELD)
        self.assertGreaterEqual(score, 0)
        self.assertLessEqual(score, 100)
        self.assertIn("Soil", details)
        self.assertIn(risk, {"LOW", "MEDIUM", "HIGH"})
        self.assertIsInstance(flags, list)

    def test_analysis_returns_ranked_results(self):
        result = analyze(FIELD)
        self.assertTrue(result["ranked"])
        self.assertIn("crop", result["ranked"][0])
        self.assertGreater(calc_profit(CROPS[0], 1)["net"], 0)


if __name__ == "__main__":
    unittest.main()
