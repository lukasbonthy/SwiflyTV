# Watch parties from movie details — v159

Party Hub now uses the catalog's canvas, page spacing, typography, pill-shaped glass controls and real movie artwork. The separate dashboard sidebar is gone. The lobby has a movie backdrop, Create and Join cards, movie search, a row of actual suggested films and the open-party list. Studio appearance settings and reduced-motion preferences carry through.

Movie details offer **Start a watch party** beside Play and Trailer, in both the full page and the details overlay. It opens Party Hub with that film's poster and title selected. Set the party name and press **Start watch party**. The room loads that film after confirming that you are its host. Opening or sharing the setup link alone creates no room. Joining someone else's party keeps their film. Series retain their existing episode controls; the current party movie service supports movies.

Search and choose a movie in the lobby, browse the catalog, or use a video link. Missing movie metadata offers retry or another selection. Late results cannot replace a newer choice. Create stays disabled while a request is unfinished. Room chat remains beside the player on wide screens and stacks below it on smaller screens. Leave, host transfer, native device-preview dismissal and stale-player safeguards from v158 remain in place.

The return link preserves the selected movie or original catalog filters and ignores saved destinations belonging to a different incoming movie. It uses browser Back when the actual referrer matches the validated destination; otherwise it follows the local link. Starting a party keeps playback history and player-return context separate.

## Update

Keep your `.env`, replace the project files, then run:

```powershell
npm install
npm start
```

On the existing Render service, deploy the latest `main` and refresh with Ctrl+F5. Open a movie's details, choose **Start a watch party**, then create your room. Party Hub is also available at `/social?tab=watchrooms`.

## Verification

```powershell
npm run check
npm run test:ui
```

All 111 behavior checks cover previous details, Studio, room lifecycle and playback controls, plus movie-party links, real HTTP metadata routes, selected-film setup, guest permissions, stale results, duplicate-create prevention and return navigation. Generated-page compilation, served asset byte checks, CSS parsing and stylesheet cascade checks also run. Provider resolution and the main watch-page player match v158.

Live visual and third-party playback checks still require the deployed site. Local DOM and stylesheet checks establish behavior and component integration, not pixel accuracy. Rooms continue to use the existing in-memory watch-party service.
