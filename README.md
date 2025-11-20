
# Siyuan Draw.io Plugin

[中文](README_zh_CN.md) | [English](README.md)

## Description
Integrated into Siyuan as a plugin

### Usage

In edit mode, type `/drawio`, select and insert it into the note.

![Insert drawio in command mode](asset/preview-1.png)
![Select or create a new drawio](asset/preview-2.png)

## Author
cowboy

## Preview
![Preview](preview.png)

## Version
0.1.36

## Changelog
- **v0.1.36 (2025-11-19)**
  - Added mobile support
- **v0.1.35 (2025-11-10)**
  - Added support for editing drawio diagrams directly from an image right-click
- **v0.1.34 (2025-11-04)**
  - Fixed a bug that prevented selected shapes from being copied as images
- **v0.1.33 (2025-10-29)**
  - Added support for svg, png, and html files; svg and png can now be inserted as images into notes
- **v0.1.32 (2025-09-29)**
  - Fixed errors with block IDs, creation time, and modification time
- **v0.1.31 (2025-04-27)**
  - Fixed a bug where uploading would create duplicates
- **v0.1.30 (2025-04-07)**
  - Fixed a bug where uploading would create duplicates
- **v0.1.29 (2025-03-28)**
  - Added Harmony platform support
- **v0.1.28 (2025-03-18)**
  - Added an upload feature to the dock bar
- **v0.1.27 (2025-03-07)**
  - Added sorting to the dock bar and set the default save path to `storage/petal/siyuan-drawio-plugin/`
- **v0.1.26 (2025-03-04)**
  - Added auto-save and optimized the display of file management buttons
- **v0.1.25 (2025-02-27)**
  - Added a dock bar on the left with rename, delete, and copy features
- **v0.1.24 (2025-02-17)**
  - Added the drawio icon to tabs
- **v0.1.23 (2025-02-08)**
  - Added support for saving outside the drawio folder
- **v0.1.22 (2025-01-21)**
  - Added configuration save and restore
- **v0.1.21 (2024-12-11)**
  - Added full-screen mode
- **v0.1.20 (2024-12-10)**
  - Fixed an error when files containing only spaces could not be found
- **v0.1.19 (2024-12-04)**
  - Updated draw.io to v25.0.2
- **v0.1.18 (2024-11-26)**
  - Added PlantUML support
- **v0.1.17 (2024-11-26)**
  - Added the simple/sketch themes
- **v0.1.16 (2024-11-26)**
  - Added the **Copy as Image** feature
- **v0.1.15 (2024-11-25)**
  - Changed file loading to reduce modifications to drawio
- **v0.1.14 (2024-11-16)**
  - Removed offline mode
- **v0.1.13 (2024-11-16)**
  - Added a refresh button in lightbox mode
- **v0.1.12 (2024-11-16)**
  - The `/` command now inserts `drawio` as an `iframe` into the note and adds the `data-assets` attribute to fix missing resource files
  - Removed the 'Copy as Siyuan Link' menu in drawio
- **v0.1.11 (2024-11-05)**
  - Optimized the logic for adding new tabs and for inserting `drawio` via the `/` command
- **v0.1.9 (2024-10-31)**
  - Fixed the popup issue when creating new files
- **v0.1.8 (2024-10-31)**
  - Fixed the `path` package error in the browser environment
- **v0.1.7 (2024-10-30)**
  - Fixed the `/` command popup not presenting any errors
- **v0.1.6 (2024-10-29)**
  - Optimized file opening logic and updated tab titles

## Minimum App Version
3.0.12

## Supported Backends
- windows
- linux
- darwin
- docker
- ios
- android

## Supported Frontends
- desktop
- mobile
- browser-desktop
- browser-mobile
- desktop-window

## Keywords
- plugin
- drawio

## Donation List

- ONIONLYONE ￥20
- 凌风 ￥10
- Manfred ￥10
