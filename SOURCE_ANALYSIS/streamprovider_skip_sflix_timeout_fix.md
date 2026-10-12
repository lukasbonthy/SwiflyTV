# StreamProvider skip sflix timeout fix

Debug showed sflix search timed out before hexa/cinezo were tested. This patch removes sflix from no-env defaults and changes localStreamProviderGetStreams to try direct TMDB providers first.
