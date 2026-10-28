# Alto

Alto keeps folders on your computer in sync with your cloud storage, such as Google Drive, Dropbox, Proton Drive and
[more](#supported-providers). It's built to look and feel native on your desktop, with current support for Linux
(GNOME specifically, with apps for macOS, Windows, and Android in the works).

> [!NOTE]
> Looking for the old Celeste code? It's on the [`celeste-rs`](https://github.com/hwittenborn/alto/tree/celeste-rs)
> branch.

![Alto's main window](https://raw.githubusercontent.com/wiki/hwittenborn/alto/screenshots/main.png)

## Features

- **True two-way sync.** New files, edits and deletions go both ways.
- **All your clouds in one place.** Connect as many accounts as you like, across different providers, and sync folders
  from all of them at once.
- **Safe across several computers.** Before overwriting or deleting anything, Alto checks that things haven't changed
  since it last looked, so a change made on another computer in the meantime is never lost.
- **Shared exclusions.** Skip files with `.gitignore`-style patterns in the folder's `.altoignore`. It syncs too, so
  every computer skips the same files.

## Supported providers

- Google Drive
- Dropbox
- Proton Drive
- Nextcloud
- ownCloud
- WebDAV

More cloud providers are on the way. Want one that isn't listed?
[Open an issue](https://github.com/hwittenborn/alto/issues), or see
[`CONTRIBUTING.md`](CONTRIBUTING.md#adding-a-provider) to add it yourself.

## Coming from Celeste?

Alto is the successor to [Celeste](https://github.com/hwittenborn/celeste), rebuilt from the ground up. It doesn't
import Celeste's settings, so you'll need to add your accounts and folders again.

## Contributing

To build Alto from source, see how it works, or help out, read [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[GPL-3.0-or-later](LICENSE)
