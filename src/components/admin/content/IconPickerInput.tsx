import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { ICON_MAP, ICON_NAMES, resolveIcon } from "@/lib/icon-map"

// A plain text input for an icon-name string (matches the backend's plain
// "Zap"/"Nfc"/etc storage) with a live preview and a small searchable grid
// picker of common icons, so admins don't have to memorize exact names.
export function IconPickerInput({
  id,
  value,
  onChange,
  placeholder = "Icon name, e.g. Zap",
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const Icon = resolveIcon(value)
  const filteredNames = ICON_NAMES.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          className="pl-9"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label="Pick icon">
            <Icon className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Search icons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
              {filteredNames.map((name) => {
                const OptionIcon = ICON_MAP[name]
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => {
                      onChange(name)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex items-center justify-center rounded-md border border-transparent p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      value === name && "border-primary/50 bg-primary/10 text-primary",
                    )}
                  >
                    <OptionIcon className="size-4" />
                  </button>
                )
              })}
              {filteredNames.length === 0 && (
                <p className="col-span-6 py-4 text-center text-xs text-muted-foreground">No icons match.</p>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
