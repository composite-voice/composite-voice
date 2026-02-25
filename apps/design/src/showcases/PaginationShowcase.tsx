import { useState } from "react";
import { Pagination, Heading, Text, Alert, Code } from "@lukeocodes/composite-voice-ui";

export default function PaginationShowcase() {
  const [currentPage1, setCurrentPage1] = useState(1);
  const [currentPage2, setCurrentPage2] = useState(1);
  const [currentPage3, setCurrentPage3] = useState(25);
  const [currentPage4, setCurrentPage4] = useState(1);
  const [currentPage5, setCurrentPage5] = useState(5);
  const [currentPageSm, setCurrentPageSm] = useState(1);
  const [currentPageMd, setCurrentPageMd] = useState(1);
  const [currentPageLg, setCurrentPageLg] = useState(1);

  return (
    <div className="space-y-12">
      <section className="space-y-2">
        <Heading level={2}>Default Pagination</Heading>
        <Text>
          Interactive pagination with 10 total pages. Click the buttons to
          navigate between pages.
        </Text>
        <Pagination
          currentPage={currentPage1}
          totalPages={10}
          onPageChange={setCurrentPage1}
        />
        <Text>
          Current page: <strong>{currentPage1}</strong>
        </Text>
      </section>

      <section className="space-y-2">
        <Heading level={2}>Few Pages</Heading>
        <Text>
          With only 3 total pages, all page numbers are shown without any
          ellipsis.
        </Text>
        <Pagination
          currentPage={currentPage2}
          totalPages={3}
          onPageChange={setCurrentPage2}
        />
      </section>

      <section className="space-y-2">
        <Heading level={2}>Many Pages</Heading>
        <Text>
          With 50 total pages starting at page 25, ellipsis appears on both
          sides of the current page range.
        </Text>
        <Pagination
          currentPage={currentPage3}
          totalPages={50}
          onPageChange={setCurrentPage3}
        />
      </section>

      <section className="space-y-2">
        <Heading level={2}>Without First/Last</Heading>
        <Text>
          The first and last page buttons are hidden using showFirstLast=false.
        </Text>
        <Pagination
          currentPage={currentPage4}
          totalPages={10}
          onPageChange={setCurrentPage4}
          showFirstLast={false}
        />
      </section>

      <section className="space-y-2">
        <Heading level={2}>Sibling Count</Heading>
        <Text>
          With siblingCount=2, more page numbers are visible around the current
          page.
        </Text>
        <Pagination
          currentPage={currentPage5}
          totalPages={10}
          onPageChange={setCurrentPage5}
          siblingCount={2}
        />
      </section>

      <section className="space-y-2">
        <Heading level={2}>Sizes</Heading>
        <Text>
          Pagination is available in three sizes: small, medium (default), and
          large.
        </Text>

        <div className="space-y-2">
          <Text>Small</Text>
          <Pagination
            currentPage={currentPageSm}
            totalPages={10}
            onPageChange={setCurrentPageSm}
            size="sm"
          />
        </div>

        <div className="space-y-2">
          <Text>Medium</Text>
          <Pagination
            currentPage={currentPageMd}
            totalPages={10}
            onPageChange={setCurrentPageMd}
            size="md"
          />
        </div>

        <div className="space-y-2">
          <Text>Large</Text>
          <Pagination
            currentPage={currentPageLg}
            totalPages={10}
            onPageChange={setCurrentPageLg}
            size="lg"
          />
        </div>
      </section>

      <section>
        <Alert variant="info" title="Accessibility Notes">
          <Text>
            The Pagination component is built with accessibility in mind. It
            renders as a <Code>nav</Code> landmark with an <Code>aria-label</Code> for screen readers. The
            active page button receives <Code>aria-current="page"</Code> to indicate the
            current location. Previous and next buttons include descriptive
            aria-labels so their purpose is clear without visual context. The
            component also includes Schema.org SiteNavigationElement markup for
            enhanced search engine understanding.
          </Text>
        </Alert>
      </section>
    </div>
  );
}
