interface ToggleSwitchProps {
  checked: boolean;
  onChange: () => void;
}

const ToggleSwitch = ({ checked, onChange }: ToggleSwitchProps) => (
  <button
    onClick={onChange}
    className={`w-10 h-5 flex items-center bg-switch rounded-full p-1 duration-300 ease-in-out ${checked ? "bg-switch dark:bg-switch" : "bg-tabhover dark:bg-tabhover"
      }`}
  >
    <div
      className={`bg-white w-3.5 h-3.5 rounded-full shadow-md transform duration-300 ease-in-out ${checked ? "translate-x-5" : "-translate-x-0.5"
        }`}
    />
  </button>
);

export default ToggleSwitch;