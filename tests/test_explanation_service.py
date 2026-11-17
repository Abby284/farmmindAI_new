import unittest
from unittest.mock import patch

from services.explanation_service import generate_explanation


HEURISTIC = {"ranked": [{"crop": {"name": "Rice"}, "pct": 88}]}
ML = {"district": "Angul", "predictions": [{"crop": "Rice", "expected_yield_tonnes_per_ha": 2.2, "source_records": 12}]}


class TestExplanationService(unittest.TestCase):
    @patch("services.explanation_service.requests.post")
    def test_ollama_response_is_used(self, post):
        post.return_value.json.return_value = {"response": "Rice fits the supplied field details. Confirm the soil test."}
        post.return_value.raise_for_status.return_value = None
        self.assertEqual(generate_explanation(HEURISTIC, ML), "Rice fits the supplied field details. Confirm the soil test.")

    @patch("services.explanation_service.requests.post", side_effect=OSError("Ollama offline"))
    def test_ollama_failure_falls_back_to_grounded_text(self, _post):
        result = generate_explanation(HEURISTIC, ML)
        self.assertIn("Rice", result)
        self.assertNotIn("unavailable", result.casefold())


if __name__ == "__main__":
    unittest.main()
