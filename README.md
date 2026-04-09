# Kisah 25 Nabi - Struktur Edit Konten

Project ini sudah dipecah supaya setiap nabi punya file sendiri, jadi kamu bisa menambah/memperbaiki kisah per nabi tanpa mengubah file besar.

## Struktur folder utama

```txt
src/
  App.tsx
  data/
    storyTypes.ts
    stories/
      adam.ts
      idris.ts
      nuh.ts
      hud.ts
      saleh.ts
      ibrahim.ts
      luth.ts
      ismail.ts
      ishaq.ts
      yaqub.ts
      yusuf.ts
      ayyub.ts
      syuaib.ts
      musa.ts
      harun.ts
      dzulkifli.ts
      dawud.ts
      sulaiman.ts
      ilyas.ts
      ilyasa.ts
      yunus.ts
      zakaria.ts
      yahya.ts
      isa.ts
      muhammad.ts
      index.ts
public/
  images/
    nabi/
      (taruh foto di sini)
```

## File yang biasa kamu edit

- `src/data/stories/<nama-nabi>.ts`
  - Ubah judul, subtitle, paragraf, lesson.
  - Ubah path foto di properti `image`.

- `src/App.tsx`
  - Di sini ada fitur audio pembacaan otomatis (Text-to-Speech) per bab.
  - Kalau ingin mengubah bahasa/kecepatan suara, edit bagian `utterance.lang` dan `utterance.rate`.

- `public/images/nabi/`
  - Tempat simpan file foto asli (`.jpg`, `.jpeg`, `.png`, `.webp`).

## Cara menambahkan foto nabi

1. Simpan file foto ke folder `public/images/nabi/`.
2. Contoh nama file: `adam.jpg`.
3. Buka `src/data/stories/adam.ts`.
4. Pastikan properti image seperti ini:

```ts
image: "/images/nabi/adam.jpg"
```

## Catatan penting

- Kalau foto belum ada atau gagal dibuka, halaman otomatis pakai ilustrasi simbolik.
- Kalau ingin menambah nabi baru, tambahkan file baru di `src/data/stories/`, lalu daftarkan import-nya di `src/data/stories/index.ts`.
- Fitur audio memakai mesin suara bawaan browser (Web Speech API), jadi kualitas suara bisa berbeda antar device/browser.
