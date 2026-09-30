import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import OtpInput from "@/components/forms/OtpInput"

describe("OtpInput", () => {
  it("renders 6 digit input fields", () => {
    render(<OtpInput onChange={vi.fn()} />)
    const inputs = screen.getAllByRole("textbox")
    expect(inputs).toHaveLength(6)
  })

  it("disables all inputs when disabled prop is true", () => {
    render(<OtpInput onChange={vi.fn()} disabled={true} />)
    const inputs = screen.getAllByRole("textbox")
    inputs.forEach((input) => {
      expect(input).toBeDisabled()
    })
  })

  it("does not disable inputs when disabled prop is false", () => {
    render(<OtpInput onChange={vi.fn()} disabled={false} />)
    const inputs = screen.getAllByRole("textbox")
    inputs.forEach((input) => {
      expect(input).not.toBeDisabled()
    })
  })
})
