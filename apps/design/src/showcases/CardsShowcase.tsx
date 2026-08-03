import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardImage,
  CardTitle,
  CardDescription,
  Button,
  Badge,
  Text,
  Heading,
  BrandName,
} from "composite-voice-ui";

export default function CardsShowcase() {
  return (
    <div className="space-y-12">
      <section>
        <Heading level={2}>Variants</Heading>
        <Text>Cards come in four variants: default, outlined, elevated, and filled.</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Card variant="default">
            <CardBody>
              <CardTitle>Default</CardTitle>
              <CardDescription>The default card variant with standard styling.</CardDescription>
            </CardBody>
          </Card>
          <Card variant="outlined">
            <CardBody>
              <CardTitle>Outlined</CardTitle>
              <CardDescription>A card with a visible border outline.</CardDescription>
            </CardBody>
          </Card>
          <Card variant="elevated">
            <CardBody>
              <CardTitle>Elevated</CardTitle>
              <CardDescription>A card with a shadow to create depth.</CardDescription>
            </CardBody>
          </Card>
          <Card variant="filled">
            <CardBody>
              <CardTitle>Filled</CardTitle>
              <CardDescription>A card with a filled background color.</CardDescription>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>With Image</Heading>
        <Text>Cards can include images at the top using the CardImage component.</Text>
        <div className="mt-4 max-w-md">
          <Card>
            <CardImage src="https://picsum.photos/seed/cv1/600/300" alt="Placeholder" />
            <CardBody>
              <CardTitle>Card with Image</CardTitle>
              <CardDescription>
                This card includes a header image loaded from a placeholder service.
              </CardDescription>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>Structured Card</Heading>
        <Text>
          Cards support a structured layout with CardHeader, CardBody, and CardFooter sections.
        </Text>
        <div className="mt-4 max-w-md">
          <Card>
            <CardHeader bordered>
              <CardTitle>Structured Card</CardTitle>
            </CardHeader>
            <CardBody>
              <CardDescription>
                This card uses separate header, body, and footer sections with bordered dividers for
                clear visual separation.
              </CardDescription>
            </CardBody>
            <CardFooter bordered>
              <Button variant="secondary">Cancel</Button>
              <Button>Confirm</Button>
            </CardFooter>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>Interactive Card</Heading>
        <Text>
          Interactive cards respond to hover and focus events, providing visual feedback to users.
        </Text>
        <div className="mt-4 max-w-md">
          <Card interactive={true}>
            <CardBody>
              <CardTitle>Interactive Card</CardTitle>
              <CardDescription>
                Hover over or focus this card to see the interactive effect. It includes a hover
                state and focus ring for accessibility.
              </CardDescription>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>Article Card with Schema.org</Heading>
        <Text>
          Cards can render as semantic HTML elements with Schema.org microdata for improved SEO and
          accessibility.
        </Text>
        <div className="mt-4 max-w-md">
          <Card as="article" itemType="https://schema.org/Article">
            <CardBody>
              <CardTitle>Understanding Voice Interfaces</CardTitle>
              <CardDescription>
                An exploration of modern voice interface design patterns and how they improve user
                experience in web applications.
              </CardDescription>
              <Text as="time" dateTime="2026-02-25">
                February 25, 2026
              </Text>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>Card Layouts</Heading>
        <Text>Cards work well in grid layouts for presenting collections of content.</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <Card>
            <CardImage src="https://picsum.photos/seed/cv2/600/300" alt="Placeholder" />
            <CardBody>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Learn the basics of setting up <BrandName /> in your project.
              </CardDescription>
            </CardBody>
          </Card>
          <Card>
            <CardImage src="https://picsum.photos/seed/cv3/600/300" alt="Placeholder" />
            <CardBody>
              <CardTitle>Provider Guide</CardTitle>
              <CardDescription>
                Explore the available STT, LLM, and TTS providers and their configuration options.
              </CardDescription>
            </CardBody>
          </Card>
          <Card>
            <CardImage src="https://picsum.photos/seed/cv4/600/300" alt="Placeholder" />
            <CardBody>
              <CardTitle>Advanced Patterns</CardTitle>
              <CardDescription>
                Deep dive into event-driven architecture, turn-taking strategies, and pipeline
                optimization.
              </CardDescription>
            </CardBody>
          </Card>
        </div>
      </section>

      <section>
        <Heading level={2}>Card with Badge</Heading>
        <Text>Cards can incorporate badges to highlight status or categories.</Text>
        <div className="mt-4 max-w-md">
          <Card>
            <CardHeader bordered>
              <CardTitle>Featured Update</CardTitle>
              <Badge>New</Badge>
            </CardHeader>
            <CardBody>
              <CardDescription>
                This card uses a Badge in the header area to draw attention to new or important
                content.
              </CardDescription>
            </CardBody>
          </Card>
        </div>
      </section>
    </div>
  );
}
