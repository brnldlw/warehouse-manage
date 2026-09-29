import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/*
 * Every popup fits the screen (index.css .dialog-shell / .dialog-body):
 *  - at most 90% of the window tall and never wider than the screen;
 *  - one scrolling middle area with a visible scroll bar;
 *  - a DialogHeader placed directly in the dialog is lifted out ABOVE the scrolling area,
 *    so the title never moves;
 *  - DialogFooter (Save/Cancel) sticks to the bottom. It must be the LAST thing in the
 *    dialog (or in the form that wraps the dialog's content).
 * The body's single column is minmax(0, 1fr): wide content (tables, long pull-down text) can
 * never stretch the dialog sideways; tables scroll inside their own overflow-x-auto box.
 * The frame is overflow: clip (cannot be scrolled at all) and the body is position: relative,
 * so hidden helper elements (e.g. the native <select> inside pull-downs) can't make the whole
 * frame shift when the browser scrolls a field into view.
 */

/** Split direct children into [headers, everything else]. */
function liftHeaders(children: React.ReactNode, headerType: unknown): [React.ReactNode[], React.ReactNode[]] {
  const all = React.Children.toArray(children)
  const isHeader = (c: React.ReactNode) => React.isValidElement(c) && c.type === headerType
  return [all.filter(isHeader), all.filter((c) => !isHeader(c))]
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { bodyClassName?: string }
>(({ className, bodyClassName, children, ...props }, ref) => {
  const [headers, body] = liftHeaders(children, DialogHeader)
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "dialog-shell fixed left-[50%] top-[50%] z-50 flex w-[calc(100vw-1rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden overflow-clip rounded-lg border border-border/40 bg-background p-0 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          className
        )}
        {...props}
      >
        {headers.length > 0 && (
          <div className="dialog-fixed-header shrink-0 border-b bg-background px-4 pb-3 pr-14 pt-4 sm:px-6 sm:pr-14 sm:pt-6">
            {headers}
          </div>
        )}
        <div className={cn("dialog-body relative grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-y-auto overscroll-contain px-4 pt-4 sm:px-6", bodyClassName)}>
          {body}
        </div>
        <DialogPrimitive.Close className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md bg-background opacity-80 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

/** Title area. Put it directly inside DialogContent: it is shown above the scrolling part. */
function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col space-y-1.5 text-left",
        className
      )}
      {...props}
    />
  )
}
DialogHeader.displayName = "DialogHeader"

/** Save/Cancel row that stays at the bottom while the dialog scrolls. Must be the last thing. */
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "dialog-sticky-footer sticky bottom-0 z-10 -mx-4 mt-2 flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:-mx-6 sm:flex-row sm:justify-end sm:px-6 sm:py-4",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-foreground",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
