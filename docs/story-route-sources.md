# Grounded story routes

Every route points to a real catalog exemplar; route descriptions are authored summaries and paraphrases. No generated title is inserted into results. An exemplar must be returned by TMDB and match its name before its recommendations can enter the candidate pool. Returned stories still pass type, genre, date, language, runtime, watched and credit constraints, then actual semantic ranking.

New routes cover workplace memory separation, a teacher turning to drug production, manufactured reality, body swapping, anonymous online romance, AI romance, memory erasure, chess, codebreaking, female mathematicians, a demanding music teacher, disease outbreaks, finance, racing and other concrete relationships the old broad topic inventory could miss. Primary catalog APIs: https://developer.themoviedb.org/reference/search-multi and https://developer.themoviedb.org/reference/movie-recommendations .

BGE’s upstream card specifies CLS pooling, normalized embeddings and query-only retrieval instructions. It also cautions that absolute cosine scores are not portable between models: https://huggingface.co/BAAI/bge-small-en-v1.5 . The app therefore ships its own measured calibration and records negative probes alongside positive matches.
