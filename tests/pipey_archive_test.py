"""Check the committed source archive, not challenge validity or execution."""

import hashlib
import io
import os
from pathlib import Path
import subprocess
import tarfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
REF = os.environ.get("PIPEY_ARCHIVE_REF", "HEAD")


def git(*args):
    return subprocess.check_output(
        ["git", "-c", "core.attributesFile=/dev/null", *args], cwd=ROOT
    )


class PipeyArchiveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.archive = tarfile.open(
            fileobj=io.BytesIO(git("archive", "--format=tar", REF)), mode="r:"
        )
        cls.tracked = {}
        for entry in git("ls-tree", "-rz", REF).split(b"\0"):
            if not entry:
                continue
            metadata, path = entry.split(b"\t", 1)
            mode, kind, digest = metadata.decode().split()
            cls.tracked[path.decode()] = (mode, kind, digest)

    @classmethod
    def tearDownClass(cls):
        cls.archive.close()

    def test_pipey_archive_omits_only_declared_development_metadata(self):
        excluded = {
            path for path in self.tracked
            if path in {".gitattributes", ".env.example"} or path.startswith(".devin/")
        }
        self.assertIn(".env.example", excluded)
        self.assertTrue(any(path.startswith(".devin/") for path in excluded))
        entries = self.archive.getmembers()
        self.assertTrue(all(entry.isfile() or entry.isdir() for entry in entries))
        files = [entry.name for entry in entries if entry.isfile()]
        self.assertEqual(len(files), len(set(files)))
        self.assertEqual(set(files), set(self.tracked) - excluded)
        self.assertIn(".gitignore", files)
        self.assertFalse(any(
            part.startswith(".")
            for entry in entries if entry.name != ".gitignore"
            for part in entry.name.rstrip("/").split("/")
        ))

    def test_pipey_archive_preserves_candidate_file_bytes_and_executable_flags(self):
        for entry in self.archive.getmembers():
            if not entry.isfile():
                continue
            with self.subTest(path=entry.name):
                mode, kind, digest = self.tracked[entry.name]
                self.assertEqual(kind, "blob")
                self.assertIn(mode, {"100644", "100755"})
                with self.archive.extractfile(entry) as source:
                    content = source.read()
                blob = b"blob " + str(len(content)).encode() + b"\0" + content
                self.assertEqual(hashlib.sha1(blob).hexdigest(), digest)
                self.assertEqual(bool(entry.mode & 0o111), mode == "100755")


if __name__ == "__main__":
    unittest.main()
