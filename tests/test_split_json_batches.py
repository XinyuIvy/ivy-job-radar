import json
import tempfile
import unittest
from pathlib import Path

from scripts.split_json_batches import split_json_array


class SplitJsonArrayTests(unittest.TestCase):
    def test_preserves_order_across_batches(self):
        payload = [{"id": index, "title": f"岗位 {index}"} for index in range(5)]

        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_path = root / "jobs.json"
            output_dir = root / "batches"
            input_path.write_text(
                json.dumps(payload, ensure_ascii=False),
                encoding="utf-8",
            )

            batch_paths = split_json_array(input_path, output_dir, batch_size=2)

            self.assertEqual(
                [path.name for path in batch_paths],
                ["batch-0001.json", "batch-0002.json", "batch-0003.json"],
            )
            reconstructed = []
            for path in batch_paths:
                reconstructed.extend(json.loads(path.read_text(encoding="utf-8")))
            self.assertEqual(reconstructed, payload)

    def test_rejects_non_array_input(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_path = root / "jobs.json"
            input_path.write_text('{"jobs": []}', encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "must be an array"):
                split_json_array(input_path, root / "batches", batch_size=40)

    def test_rejects_invalid_batch_size(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_path = root / "jobs.json"
            input_path.write_text("[]", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "at least 1"):
                split_json_array(input_path, root / "batches", batch_size=0)


if __name__ == "__main__":
    unittest.main()
