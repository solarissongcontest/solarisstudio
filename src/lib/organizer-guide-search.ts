type GuideQuestionLike = {
  question: string;
};

type GuideSectionLike<TQuestion extends GuideQuestionLike> = {
  title: string;
  description?: string;
  questions: readonly TQuestion[];
};

type FilteredSection<TSection extends GuideSectionLike<GuideQuestionLike>> =
  Omit<TSection, "questions"> & { questions: Array<TSection["questions"][number]> };

export function filterOrganizerGuideSections<TSection extends GuideSectionLike<GuideQuestionLike>>(
  sections: readonly TSection[], query: string,
): Array<FilteredSection<TSection>> {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filtered = sections
    .map((section) => {
      const sectionMatches = [section.title, section.description ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      );
      const questions = !normalizedQuery || sectionMatches
        ? [...section.questions]
        : section.questions.filter((item) =>
            item.question.toLocaleLowerCase().includes(normalizedQuery),
          );

      return {
        ...section,
        questions,
      };
    })
    .filter((section) => section.questions.length > 0);

  // Filtering changes only membership; every retained question and all section
  // metadata come from the input. Preserve that indexed element type for JSX answers.
  return filtered as Array<FilteredSection<TSection>>;
}

export function countOrganizerGuideAnswers(
  sections: readonly { questions: readonly unknown[] }[],
) {
  return sections.reduce((total, section) => total + section.questions.length, 0);
}
