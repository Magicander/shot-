"""Test jednostkowy fallbacku scrapera (bez sieci): python3 test_scraper_fallback.py"""
import sqlite3, unittest
import numpy as np
import scraper


def fake_frames(n, k, seed=0):
    rng = np.random.default_rng(seed)
    return [(float(i), b"jpg", rng.integers(0, 255, (18, 32)).astype(np.int16)) for i in range(k)]


class Fallback(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:"); self.con.row_factory = sqlite3.Row
        self.con.executescript("""CREATE TABLE movies(id INTEGER PRIMARY KEY, title, year, query, yt_url, tried_ids TEXT DEFAULT '',
            video_id, video_title, video_url, status, error, updated);
            CREATE TABLE frames(movie_id, position, ts_seconds, image); CREATE TABLE picks(movie_id);
            INSERT INTO movies(id,title,year,query,yt_url) VALUES (1,'A Nightmare on Elm Street',1984,NULL,NULL);""")
        scraper.time.sleep = lambda s: None
        self.entries = [{"id": f"vid{i:08d}", "title": f"A Nightmare on Elm Street (1984) Official Trailer {i}",
                         "duration": 120, "channel": "Warner Bros"} for i in range(4)]

    def row(self): return self.con.execute("SELECT * FROM movies WHERE id=1").fetchone()

    def test_unavailable_first_then_next(self):
        calls = []
        def dl(url, wd):
            calls.append(url)
            if len(calls) == 1:
                raise RuntimeError("\x1b[0;31mERROR:\x1b[0m [youtube] hDZ7y8RP5HE: This video is not available")
            return wd / "video.mp4", {"title": "ok"}
        n = scraper.process_movie(self.con, self.row(), 8, log=lambda m: None,
                                  searcher=lambda q, log: self.entries, downloader=dl,
                                  extractor=lambda v, n, stop, relax=0: fake_frames(n, 8))
        self.assertEqual(len(calls), 2)
        self.assertEqual(n, 8)
        r = self.row()
        self.assertEqual(r["status"], "ok")
        self.assertIn(calls[0].split("=")[1] + "!", r["tried_ids"])     # pierwszy oznaczony jako zablokowany
        # redo: zablokowany idzie na koniec kolejki
        calls.clear()
        scraper.process_movie(self.con, self.row(), 8, log=lambda m: None, searcher=lambda q, log: self.entries,
                              downloader=lambda u, wd: (calls.append(u), (wd / "v.mp4", {}))[1],
                              extractor=lambda v, n, stop, relax=0: fake_frames(n, 8))
        self.assertNotIn("vid00000000", calls[0])

    def test_few_frames_merges_two(self):
        n = scraper.process_movie(self.con, self.row(), 10, log=lambda m: None,
                                  searcher=lambda q, log: self.entries, downloader=lambda u, wd: (wd / "v.mp4", {}),
                                  extractor=lambda v, n, stop, relax=0: fake_frames(n, 2, seed=hash(str(v)) % 1000))
        self.assertEqual(n, 4)           # 2 + 2 z dwóch trailerów

    def test_all_fail_short_code(self):
        def dl(u, wd): raise RuntimeError("Sign in to confirm you're not a bot")
        with self.assertRaises(scraper.ScrapeError) as c:
            scraper.process_movie(self.con, self.row(), 8, log=lambda m: None,
                                  searcher=lambda q, log: self.entries, downloader=dl)
        self.assertEqual(str(c.exception), "all_failed:4")
        self.assertEqual(scraper.err_text("all_failed:4", "en"), "none of 4 trailers could be downloaded")

    def test_relax_last_resort(self):
        ext = lambda v, n, stop, relax=0: fake_frames(n, [1, 2, 5][relax])
        n = scraper.process_movie(self.con, self.row(), 8, log=lambda m: None,
                                  searcher=lambda q, log: self.entries[:1], downloader=lambda u, wd: (wd / "v.mp4", {}),
                                  extractor=ext)
        self.assertEqual(n, 5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
