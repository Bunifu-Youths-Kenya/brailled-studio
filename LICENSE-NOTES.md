# License and trademark notes

Brailled is built from a fork of
[scratchfoundation/scratch-editor](https://github.com/scratchfoundation/scratch-editor). These notes summarise
the obligations that come with that. They are not legal advice; [LICENSE](LICENSE) and [TRADEMARK](TRADEMARK)
are the authoritative texts.

## License: AGPL-3.0

The root of this repository and every Scratch package in `packages/` are licensed AGPL-3.0-only. Third-party
dependencies carry their own licenses.

- **We must publish the source of any modified version we serve online.** AGPL section 13 requires that everyone
  who interacts with our modified version over a network is prominently offered its complete corresponding
  source, at no charge. A link inside the product to the source of the exact version being served does this.
- Keep the existing license and copyright notices, and record our changes
  (see [BRAILLED-CHANGES.md](BRAILLED-CHANGES.md)).
- Distributing builds (downloads, devices, offline installs) also requires providing the source.

## Trademarks

From [TRADEMARK](TRADEMARK):

> The Scratch trademarks, including the Scratch name, logo, the Scratch Cat, Gobo, Pico, Nano, Tera and Giga
> graphics (the "Marks"), are property of the Scratch Foundation. Marks may not be used to endorse or promote
> products derived from this software without specific prior written permission.

Our rules:

- The product is called **Brailled**.
- **Never use the Scratch name or logo in anything we ship.** Leave out the Scratch Cat, Gobo, Pico, Nano, Tera
  and Giga graphics too.
- Referring to Scratch in source code, license files and developer notes such as this one, to say where the
  code came from, is not shipping it as our brand.

## Not yet shippable

The Scratch logo has been replaced by the name Brailled in the editor's menu bar. No other branding has been
changed. Scratch branding remains in at least these places, and all of it must be removed or replaced before
anyone outside the team is given a build or a hosted copy:

- the page title ("Scratch 3.0 GUI") and the default project name ("Scratch Project")
- the default cat sprite and its watermark, library artwork (including the Marks) and the favicon
- the example and tutorial library opened by the Examples button
- messages that name Scratch: crash, unsupported browser, WebGL, telemetry, alert and device connection dialogs
- the logo shown on the full screen stage when the editor is embedded
- the titles and branding of the other playground pages (player, standalone, blocks only and so on)

The inherited CI workflow (`.github/workflows/ci.yml`) publishes a playground build to GitHub Pages on push.
Do not enable GitHub Actions on this repository until that step is disabled or the branding is gone.
