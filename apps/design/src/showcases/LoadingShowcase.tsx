import { useState } from "react";
import {
  Spinner,
  Skeleton,
  ProgressBar,
  Button,
  Heading,
  Text,
} from "@lukeocodes/composite-voice-ui";

export default function LoadingShowcase() {
  const [progressValue, setProgressValue] = useState(30);

  return (
    <div className="space-y-12">
      {/* Spinners */}
      <section>
        <Heading level={2}>Spinners</Heading>
        <Text>Available in multiple sizes and colors.</Text>
        <div className="mt-4 flex items-center gap-4">
          <Spinner size="xs" />
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <Spinner size="xl" />
        </div>
        <div className="mt-4 flex items-center gap-4">
          <Spinner color="primary" />
          <Spinner color="secondary" />
          <div className="bg-neutral-800 p-4 rounded-lg inline-flex">
            <Spinner color="white" />
          </div>
          <Spinner color="current" />
          <Spinner color="danger" />
          <Spinner color="success" />
        </div>
      </section>

      {/* Spinner with Custom Label */}
      <section>
        <Heading level={2}>Spinner with Custom Label</Heading>
        <Text>A spinner can display a descriptive label alongside it.</Text>
        <div className="mt-4">
          <Spinner label="Processing your request" />
        </div>
      </section>

      {/* Skeleton — Text */}
      <section>
        <Heading level={2}>Skeleton — Text</Heading>
        <Text>Text skeletons simulate lines of content loading.</Text>
        <div className="mt-4 space-y-6">
          <Skeleton variant="text" lines={1} />
          <Skeleton variant="text" lines={2} />
          <Skeleton variant="text" lines={3} />
        </div>
      </section>

      {/* Skeleton — Shapes */}
      <section>
        <Heading level={2}>Skeleton — Shapes</Heading>
        <Text>Circular, rectangular, and rounded skeleton placeholders.</Text>
        <div className="mt-4 flex items-center gap-6">
          <Skeleton variant="circular" width={64} height={64} />
          <Skeleton variant="rectangular" width={200} height={100} />
          <Skeleton variant="rounded" width={200} height={100} />
        </div>
      </section>

      {/* Skeleton — Static */}
      <section>
        <Heading level={2}>Skeleton — Static</Heading>
        <Text>A skeleton with animation disabled.</Text>
        <div className="mt-4">
          <Skeleton variant="text" lines={2} animate={false} />
        </div>
      </section>

      {/* Skeleton — Composite */}
      <section>
        <Heading level={2}>Skeleton — Composite</Heading>
        <Text>A realistic card-like skeleton layout combining multiple variants.</Text>
        <div className="mt-4 flex items-start gap-4 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
          <Skeleton variant="circular" width={48} height={48} />
          <div className="flex-1 space-y-3">
            <Skeleton variant="text" lines={1} />
            <Skeleton variant="text" lines={3} />
          </div>
        </div>
      </section>

      {/* Progress Bar — Determinate */}
      <section>
        <Heading level={2}>Progress Bar — Determinate</Heading>
        <Text>Progress bars at various completion levels with visible values.</Text>
        <div className="mt-4 space-y-4">
          <ProgressBar value={0} showValue={true} label="Not started" />
          <ProgressBar value={25} showValue={true} label="Quarter done" />
          <ProgressBar value={50} showValue={true} label="Halfway there" />
          <ProgressBar value={75} showValue={true} label="Almost done" />
          <ProgressBar value={100} showValue={true} label="Complete" />
        </div>
      </section>

      {/* Progress Bar — Colors */}
      <section>
        <Heading level={2}>Progress Bar — Colors</Heading>
        <Text>Progress bars in all available color variants.</Text>
        <div className="mt-4 space-y-4">
          <ProgressBar value={60} color="primary" label="Primary" />
          <ProgressBar value={60} color="success" label="Success" />
          <ProgressBar value={60} color="warning" label="Warning" />
          <ProgressBar value={60} color="danger" label="Danger" />
          <ProgressBar value={60} color="info" label="Info" />
          <ProgressBar value={60} color="accent" label="Accent" />
        </div>
      </section>

      {/* Progress Bar — Sizes */}
      <section>
        <Heading level={2}>Progress Bar — Sizes</Heading>
        <Text>Progress bars in all available sizes.</Text>
        <div className="mt-4 space-y-4">
          <ProgressBar value={50} size="xs" label="Extra small" />
          <ProgressBar value={50} size="sm" label="Small" />
          <ProgressBar value={50} size="md" label="Medium" />
          <ProgressBar value={50} size="lg" label="Large" />
        </div>
      </section>

      {/* Progress Bar — Indeterminate */}
      <section>
        <Heading level={2}>Progress Bar — Indeterminate</Heading>
        <Text>An indeterminate progress bar for unknown durations.</Text>
        <div className="mt-4">
          <ProgressBar indeterminate={true} label="Loading..." />
        </div>
      </section>

      {/* Progress Bar — Interactive */}
      <section>
        <Heading level={2}>Progress Bar — Interactive</Heading>
        <Text>Use the buttons to increment or decrement the progress value.</Text>
        <div className="mt-4 space-y-4">
          <ProgressBar value={progressValue} showValue={true} label="Interactive progress" />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProgressValue((v) => Math.max(0, v - 10))}
            >
              − 10
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProgressValue((v) => Math.min(100, v + 10))}
            >
              + 10
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setProgressValue(0)}
            >
              Reset
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
