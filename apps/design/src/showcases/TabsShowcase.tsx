import { useState } from "react";
import {
  Tabs,
  TabList,
  Tab,
  TabPanel,
  Heading,
  Text,
  Alert,
  Prose,
} from "composite-voice-ui";

export default function TabsShowcase() {
  const [activeTab, setActiveTab] = useState("controlled1");

  return (
    <div className="space-y-12">
      {/* Default Tabs */}
      <section>
        <Heading level={2}>Default Tabs</Heading>
        <div className="bg-surface rounded-lg border border-neutral-200 p-4">
          <Tabs defaultValue="tab1">
            <TabList>
              <Tab value="tab1">Overview</Tab>
              <Tab value="tab2">Features</Tab>
              <Tab value="tab3">Pricing</Tab>
            </TabList>
            <TabPanel value="tab1">
              <Text>
                This is the overview panel. It provides a high-level summary of
                the product and its capabilities.
              </Text>
            </TabPanel>
            <TabPanel value="tab2">
              <Text>
                Explore the full list of features including real-time
                collaboration, advanced analytics, and seamless integrations.
              </Text>
            </TabPanel>
            <TabPanel value="tab3">
              <Text>
                Choose from flexible pricing plans designed to scale with your
                team, from free tier to enterprise.
              </Text>
            </TabPanel>
          </Tabs>
        </div>
      </section>

      {/* With Disabled Tab */}
      <section>
        <Heading level={2}>With Disabled Tab</Heading>
        <div className="bg-surface rounded-lg border border-neutral-200 p-4">
          <Tabs defaultValue="tab1">
            <TabList>
              <Tab value="tab1">Overview</Tab>
              <Tab value="tab2" disabled={true}>
                Features
              </Tab>
              <Tab value="tab3">Pricing</Tab>
            </TabList>
            <TabPanel value="tab1">
              <Text>
                This is the overview panel. The Features tab is disabled and
                cannot be selected.
              </Text>
            </TabPanel>
            <TabPanel value="tab2">
              <Text>
                This panel is not reachable because its tab is disabled.
              </Text>
            </TabPanel>
            <TabPanel value="tab3">
              <Text>
                Choose from flexible pricing plans designed to scale with your
                team.
              </Text>
            </TabPanel>
          </Tabs>
        </div>
      </section>

      {/* Controlled Tabs */}
      <section>
        <Heading level={2}>Controlled Tabs</Heading>
        <div className="bg-surface rounded-lg border border-neutral-200 p-4">
          <Tabs
            value={activeTab}
            onChange={(value: string) => setActiveTab(value)}
          >
            <TabList>
              <Tab value="controlled1">First</Tab>
              <Tab value="controlled2">Second</Tab>
              <Tab value="controlled3">Third</Tab>
            </TabList>
            <TabPanel value="controlled1">
              <Text>Content for the first controlled tab.</Text>
            </TabPanel>
            <TabPanel value="controlled2">
              <Text>Content for the second controlled tab.</Text>
            </TabPanel>
            <TabPanel value="controlled3">
              <Text>Content for the third controlled tab.</Text>
            </TabPanel>
          </Tabs>
          <Text>
            Current active tab: <strong>{activeTab}</strong>
          </Text>
        </div>
      </section>

      {/* Many Tabs */}
      <section>
        <Heading level={2}>Many Tabs</Heading>
        <div className="bg-surface rounded-lg border border-neutral-200 p-4">
          <Tabs defaultValue="dashboard">
            <TabList>
              <Tab value="dashboard">Dashboard</Tab>
              <Tab value="analytics">Analytics</Tab>
              <Tab value="reports">Reports</Tab>
              <Tab value="settings">Settings</Tab>
              <Tab value="users">Users</Tab>
              <Tab value="billing">Billing</Tab>
              <Tab value="integrations">Integrations</Tab>
            </TabList>
            <TabPanel value="dashboard">
              <Text>
                Your main dashboard with an overview of key metrics and recent
                activity.
              </Text>
            </TabPanel>
            <TabPanel value="analytics">
              <Text>
                Dive deep into analytics with charts, graphs, and trend data.
              </Text>
            </TabPanel>
            <TabPanel value="reports">
              <Text>
                Generate and download reports for stakeholders and team reviews.
              </Text>
            </TabPanel>
            <TabPanel value="settings">
              <Text>
                Configure application settings, preferences, and notification
                options.
              </Text>
            </TabPanel>
            <TabPanel value="users">
              <Text>
                Manage team members, roles, and permissions across your
                organization.
              </Text>
            </TabPanel>
            <TabPanel value="billing">
              <Text>
                View invoices, update payment methods, and manage your
                subscription plan.
              </Text>
            </TabPanel>
            <TabPanel value="integrations">
              <Text>
                Connect third-party services and configure API integrations.
              </Text>
            </TabPanel>
          </Tabs>
        </div>
      </section>

      {/* Accessibility Notes */}
      <section>
        <Alert variant="info" title="Accessibility Notes">
          <Prose size="sm">
            <p>
              The Tabs component follows the WAI-ARIA Tabs pattern for full
              accessibility support:
            </p>
            <ul>
              <li>
                <strong>Arrow keys</strong> move focus between tabs in the tab list.
                Left and Right arrows navigate horizontally through the available
                tabs.
              </li>
              <li>
                <strong>Home and End</strong> keys jump focus to the first and last
                tab in the tab list respectively.
              </li>
              <li>
                <strong>Tab key</strong> moves focus from the active tab into the
                associated tab panel content, allowing keyboard users to access the
                panel.
              </li>
              <li>
                <code>aria-selected</code> indicates the currently active tab,
                ensuring screen readers announce the selected state to users.
              </li>
            </ul>
          </Prose>
        </Alert>
      </section>
    </div>
  );
}
