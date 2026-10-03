import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateImageFile } from './portal'

const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0x00])

const imageFile = (
  bytes: Uint8Array = jpegHeader,
  name = 'image.jpg',
  type = 'image/jpeg',
) => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return new File([buffer], name, { type })
}

describe('validateImageFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts supported image signatures under the size and pixel limits', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 100,
      height: 100,
      close: vi.fn(),
    }))

    await expect(validateImageFile(imageFile())).resolves.toBeUndefined()
  })

  it('rejects mismatched types, signatures, excessive file size, and excessive dimensions', async () => {
    await expect(validateImageFile(imageFile(jpegHeader, 'image.png', 'image/png'))).rejects.toThrow(/declared image format/)
    await expect(validateImageFile(imageFile(jpegHeader, 'image.gif', 'image/gif'))).rejects.toThrow(/JPEG, PNG, or WebP/)
    await expect(validateImageFile(imageFile(new Uint8Array(5 * 1024 * 1024 + 1)))).rejects.toThrow(/5 MB/)

    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
      width: 5001,
      height: 5000,
      close: vi.fn(),
    }))
    await expect(validateImageFile(imageFile())).rejects.toThrow(/25 megapixels/)
  })
})
